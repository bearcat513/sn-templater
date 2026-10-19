import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SlideEditor } from '../builder/editor'
import { Inspector, TransitionSection, type TransitionControl } from '../builder/Inspector'
import {
    addElements,
    align,
    arrange as stack,
    deleteSlide,
    distribute,
    duplicateSlide,
    insertSlide,
    moveSlide,
    newCodeBox,
    newImage,
    newLine,
    newShape,
    newTable,
    newTextBox,
    offsetCopies,
    patchElements,
    removeElements,
    setHidden,
    styleFor,
    styleOf,
    updateSlide,
    type CopiedStyle,
} from '../builder/operations'
import { Ribbon } from '../builder/Ribbon'
import { SlideCanvas } from '../builder/SlideCanvas'
import { SlideSorter } from '../builder/SlideSorter'
import { useHistory } from '../builder/useHistory'
import { canChangePresentation, loadDeck, sourceOf, type DeckSource, type LoadedDeck } from '../data/deck'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { decodeImage } from '../engine/image'
import { prepareImageFile } from '../engine/imageFile'
import { pageDimensions } from '../engine/pdf'
import {
    DEFAULT_TRANSITION,
    EMPTY_BODY,
    MAX_CUSTOM_SLIDES,
    MAX_ELEMENTS,
    MAX_NOTES_LENGTH,
    MAX_PRESENTATION_BODY_LENGTH,
    applyTransitionToAll,
    customKey,
    layoutSlide,
    orderOf,
    readPresentation,
    serializePresentation,
    withSlideOptions,
    type CustomSlide,
    type PresentationBody,
    type SlideElement,
    type SlideLayout,
} from '../engine/presentation'
import { renderPdfSlides, resolvePage } from '../engine/render'
import { documentFileName } from '../engine/tokens'
import { useAsync } from '../hooks/useAsync'
import { useElementSize } from '../hooks/useElementSize'
import { downloadBytes } from '../hooks/usePdf'
import { replaceUrl, setPageTitle, type Navigate } from '../hooks/useRoute'
import { PresentationService, type PresentationRecord } from '../services/presentations'
import { SchemaService } from '../services/schema'
import { TemplateService } from '../services/templates'
import { arrange, paginate, shown, type Slide } from '../slides/paginate'
import { Presenter } from '../slides/Presenter'
import { SlideView } from '../slides/SlideView'
import { Badge, Button, EmptyState, Field, Input, Notice, Spinner, Textarea } from '../ui/controls'
import { ConfirmModal, Menu, Modal, useToast } from '../ui/overlays'
import { SelectionForm, TemplateChooser, type Selection } from './common'

/** What a presentation is besides its slides: its name and where its records come from. */
type Meta = DeckSource & { name: string }

/**
 * What was last saved, to tell whether there is anything to save. The body is
 * compared by identity — the undo history hands back the very object that
 * was saved, so undoing to it is clean — which keeps a drag from serializing
 * every picture on the slide sixty times a second.
 */
type Saved = { meta: string; body: PresentationBody }
const savedAs = (meta: Meta | null, body: PresentationBody): Saved => ({ meta: JSON.stringify(meta), body })

/** Elements copied with Ctrl+C, kept for pasting onto any slide of any presentation in this tab. */
let clipboard: SlideElement[] = []

/** A look copied with Ctrl+Shift+C, for Ctrl+Shift+V onto anything else. */
let copiedStyle: CopiedStyle | null = null

const isTyping = (target: EventTarget | null) => {
    const element = target as HTMLElement | null
    return Boolean(element && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable))
}

/**
 * The slide builder: a deck's slides in a running order of the author's own,
 * with custom slides — blank ones, laid out by hand — slotted in anywhere,
 * saved as a presentation to open and present again.
 *
 * `?view=build&id=…` opens a saved presentation; `?view=build&template=…`
 * (with `query`, `order`, `limit` and `title`) starts a new one on a deck.
 */
export function BuilderView({ params, navigate }: { params: URLSearchParams; navigate: Navigate }) {
    const session = useSession()
    const toast = useToast()
    const [record, setRecord] = useState<PresentationRecord | null>(null)
    const [meta, setMeta] = useState<Meta | null>(null)
    const [deck, setDeck] = useState<LoadedDeck | null>(null)
    const history = useHistory<PresentationBody>(EMPTY_BODY)
    const body = history.value
    const [saved, setSaved] = useState<Saved>(() => savedAs(null, EMPTY_BODY))
    const [opening, setOpening] = useState('Opening…')
    const [loadError, setLoadError] = useState('')
    const [deckError, setDeckError] = useState('')
    const [current, setCurrent] = useState('')
    const [selection, setSelection] = useState<string[]>([])
    const [editing, setEditing] = useState<string | null>(null)
    const [presenting, setPresenting] = useState<number | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [pending, setPending] = useState<(() => void) | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [painter, setPainter] = useState<CopiedStyle | null>(null)
    const [notesOpen, setNotesOpen] = useState(true)
    const imageInput = useRef<HTMLInputElement>(null)

    /* -------------------------------- loading ------------------------------- */

    const openDeck = useCallback(
        async (source: DeckSource) => {
            setDeckError('')
            setOpening('Reading records…')
            try {
                const loaded = await loadDeck(source, session, (done, total) =>
                    setOpening(total ? `Reading related lists… ${done} of ${total}` : 'Reading records…')
                )
                setDeck(loaded)
                // A new presentation is named after its deck until someone names it.
                setMeta(current => (current && !current.name ? { ...current, name: current.title || loaded.record.name } : current))
                log.info('builder', `Loaded ${loaded.job.records.length} records for “${source.title}”`, {
                    template: loaded.record.sysId,
                    matched: loaded.matched,
                })
            } catch (failure) {
                const { message, data } = describeError(failure)
                log.error('builder', message, data)
                setDeck(null)
                setDeckError(failure instanceof Error ? failure.message : String(failure))
            } finally {
                setOpening('')
            }
        },
        [session]
    )

    useEffect(() => {
        let live = true
        ;(async () => {
            const id = params.get('id')
            let nextMeta: Meta
            let nextBody: PresentationBody = EMPTY_BODY
            if (id) {
                const found = await PresentationService.get(id)
                if (!live) return
                setRecord(found)
                nextMeta = { ...sourceOf(found), name: found.name }
                nextBody = readPresentation(found.body ?? '')
                setPageTitle(found.name)
            } else {
                const templateId = params.get('template') ?? ''
                const title = params.get('title') ?? ''
                nextMeta = {
                    templateId,
                    title,
                    name: title,
                    query: params.get('query') ?? '',
                    orderBy: params.get('order') ?? '',
                    limit: Number(params.get('limit')) || 20,
                }
                setPageTitle('New presentation')
            }
            setMeta(nextMeta)
            history.reset(nextBody)
            setSaved(savedAs(nextMeta, nextBody))
            if (nextMeta.templateId) await openDeck(nextMeta)
            else {
                setOpening('')
                setSettingsOpen(true)
            }
        })().catch(failure => live && setLoadError(failure instanceof Error ? failure.message : String(failure)))
        return () => {
            live = false
        }
        // Opened once per mount; the view is remounted when its address changes.
    }, [])

    /* ------------------------------- the slides ----------------------------- */

    const generated = useMemo(() => (deck ? paginate(deck.template, deck.job) : []), [deck])
    const slides = useMemo(() => (deck ? arrange(generated, deck.job, body) : []), [deck, generated, body])
    const visible = useMemo(() => shown(slides), [slides])

    useEffect(() => {
        if (slides.length && !slides.some(slide => slide.key === current)) setCurrent(slides[0]!.key)
    }, [slides, current])

    const index = slides.findIndex(slide => slide.key === current)
    const slide: Slide | undefined = slides[index]
    const custom = slide?.custom

    const page = deck ? resolvePage(deck.template) : null
    const dims = page ? pageDimensions(page.size, page.landscape) : { width: 960, height: 540 }
    // The page is the deck's, so the deck is the dependency.
    const sheet = useMemo(() => (page ? { ...dims, page } : null), [deck])

    const choose = (key: string) => {
        setCurrent(key)
        setSelection([])
        setEditing(null)
        setPainter(null)
    }

    const dirty = Boolean(meta) && (body !== saved.body || JSON.stringify(meta) !== saved.meta)
    const canChange = canChangePresentation(record, session)

    useInspect('builder.record', record)
    useInspect('builder.meta', meta)
    useInspect('builder.body', body)
    useInspect('builder.slides', useMemo(() => slides.map(entry => ({ key: entry.key, label: entry.label, hidden: entry.hidden })), [slides]))

    /* ------------------------------ slide changes --------------------------- */

    const insert = (at: number, layout: SlideLayout) => {
        if (!sheet) return
        if (body.slides.length >= MAX_CUSTOM_SLIDES) {
            toast(`A presentation can have at most ${MAX_CUSTOM_SLIDES} custom slides.`, 'critical')
            return
        }
        const made = layoutSlide(layout, sheet)
        history.set(currentBody => insertSlide(currentBody, slides, at, made))
        choose(customKey(made.id))
    }

    const changeSlide = useCallback(
        (change: (slide: CustomSlide) => CustomSlide, merge?: string) => {
            if (!custom) return
            const id = custom.id
            history.set(currentBody => updateSlide(currentBody, id, change), merge)
        },
        [custom, history.set]
    )

    const place = (elements: SlideElement[], edit = false) => {
        if (!custom) return
        if (custom.elements.length + elements.length > MAX_ELEMENTS) {
            toast(`A slide can hold at most ${MAX_ELEMENTS} things.`, 'critical')
            return
        }
        changeSlide(current => addElements(current, elements))
        setSelection(elements.map(element => element.id))
        setEditing(edit && elements.length === 1 ? elements[0]!.id : null)
    }

    const placeImage = async (file: File, at?: [number, number]) => {
        if (!sheet) return
        const prepared = await prepareImageFile(file)
        if (!prepared.ok) {
            toast(prepared.error, 'critical')
            return
        }
        const decoded = decodeImage(prepared.image.source)
        if (!decoded.ok) {
            toast(decoded.error, 'critical')
            return
        }
        const element = newImage(sheet, prepared.image.source, decoded.image)
        if (at) {
            element.x = Math.round(at[0] - element.w / 2)
            element.y = Math.round(at[1] - element.h / 2)
        }
        place([element])
        if (prepared.image.note) toast(`Picture prepared for the PDF: ${prepared.image.note}.`, 'info')
    }

    /** Paints the copied look onto one element, as the format painter does when it is clicked. */
    const paint = (ids: string[], style: CopiedStyle | null) => {
        if (!style || !ids.length) return
        changeSlide(current => patchElements(current, ids, element => styleFor(element, style)))
    }

    const editor: SlideEditor | null =
        custom && sheet
            ? {
                  slide: custom,
                  sheet,
                  selection,
                  selected: custom.elements.filter(element => selection.includes(element.id)),
                  select: ids => {
                      setSelection(ids)
                      setEditing(null)
                  },
                  change: changeSlide,
                  patch: (patch, merge) => changeSlide(current => patchElements(current, selection, patch), merge),
                  insertText: () => place([newTextBox(sheet)], true),
                  insertShape: shape => place([newShape(sheet, shape)]),
                  insertLine: arrow => place([newLine(sheet, arrow)]),
                  insertCode: () => place([newCodeBox(sheet)], true),
                  insertTable: (rows, columns) => place([newTable(sheet, rows, columns)]),
                  insertImage: file => (file ? void placeImage(file) : imageInput.current?.click()),
                  painter,
                  togglePainter: () => {
                      if (painter) return setPainter(null)
                      const source = custom.elements.find(element => selection.includes(element.id))
                      if (source) setPainter(styleOf(source))
                  },
                  remove: () => {
                      changeSlide(current => removeElements(current, selection))
                      setSelection([])
                      setEditing(null)
                  },
                  duplicate: () => {
                      const copies = offsetCopies(custom.elements.filter(element => selection.includes(element.id)))
                      if (copies.length) place(copies)
                  },
                  arrange: how => changeSlide(current => stack(current, selection, how)),
                  align: how => changeSlide(current => align(current, selection, how, sheet)),
                  distribute: axis => changeSlide(current => distribute(current, selection, axis)),
              }
            : null

    /* --------------------------- notes and transitions ---------------------- */

    const slideOptions = slide ? body.options?.[slide.key] : undefined
    const transition: TransitionControl | null = slide
        ? {
              value: slideOptions?.transition,
              deck: body.transition ?? DEFAULT_TRANSITION,
              onChange: next => history.set(currentBody => withSlideOptions(currentBody, slide.key, { transition: next })),
              onApplyAll: () => {
                  const chosen = slideOptions?.transition ?? body.transition ?? DEFAULT_TRANSITION
                  history.set(currentBody => applyTransitionToAll(currentBody, chosen))
                  toast(`Every slide now comes in with ${chosen === 'none' ? 'no transition' : `a ${chosen}`}.`)
              },
          }
        : null

    const setNotes = (notes: string) => {
        if (!slide) return
        const key = slide.key
        history.set(currentBody => withSlideOptions(currentBody, key, { notes }), `notes:${key}`)
    }

    /* ------------------------------ saving ---------------------------------- */

    const save = useCallback(
        async (asCopy = false) => {
            if (!meta || saving) return
            if (!meta.templateId) {
                setSettingsOpen(true)
                return
            }
            const name = meta.name.trim() || meta.title.trim() || deck?.record.name || 'Untitled presentation'
            // The order as the author saw it, record slides placed by the arrangement included.
            const text = serializePresentation({ ...body, order: orderOf(slides) })
            if (text.length > MAX_PRESENTATION_BODY_LENGTH) {
                setSaveError(
                    `This presentation is too large to save (${Math.round(text.length / 1000).toLocaleString()} kB of ${
                        MAX_PRESENTATION_BODY_LENGTH / 1000
                    } kB). Pictures take the most room: remove or replace a large one.`
                )
                return
            }
            setSaving(true)
            setSaveError('')
            try {
                const input = {
                    name: (asCopy ? `${name} (copy)` : name).slice(0, 100),
                    template: meta.templateId,
                    title: meta.title,
                    query: meta.query,
                    orderBy: meta.orderBy,
                    limit: meta.limit,
                    body: text,
                }
                const stored =
                    record && !asCopy && canChange
                        ? await PresentationService.update(record.sysId, input)
                        : await PresentationService.create(input)
                const nextMeta = { ...meta, name: stored.name }
                setRecord(stored)
                setMeta(nextMeta)
                setSaved(savedAs(nextMeta, body))
                replaceUrl('build', { id: stored.sysId })
                setPageTitle(stored.name)
                log.info('builder', `Saved “${stored.name}”`, { sysId: stored.sysId, bodyLength: text.length })
                toast(record && !asCopy && canChange ? 'Presentation saved.' : `Saved “${stored.name}”.`)
            } catch (failure) {
                const { message, data } = describeError(failure)
                log.error('builder', `Save failed: ${message}`, data)
                setSaveError(failure instanceof Error ? failure.message : 'The presentation could not be saved.')
            } finally {
                setSaving(false)
            }
        },
        [meta, saving, deck, body, slides, record, canChange, toast]
    )

    const remove = async () => {
        setConfirmDelete(false)
        if (!record) return
        try {
            await PresentationService.remove(record.sysId)
            setSaved(savedAs(meta, body))
            toast(`Deleted “${record.name}”.`)
            navigate('present')
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The presentation could not be deleted.', 'critical')
        }
    }

    /* ------------------------------ leaving --------------------------------- */

    useEffect(() => {
        if (!dirty) return
        const onUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', onUnload)
        return () => window.removeEventListener('beforeunload', onUnload)
    }, [dirty])

    const guarded = (go: () => void) => (dirty ? setPending(() => go) : go())

    /* ------------------------------ presenting ------------------------------ */

    const present = (fromCurrent: boolean) => {
        const at = fromCurrent && slide && !slide.hidden ? visible.findIndex(entry => entry.key === slide.key) : 0
        setEditing(null)
        setPresenting(Math.max(0, at))
    }

    const exportPdf = () => {
        if (!deck || !meta) return
        try {
            const drawn = log.time('render', `Presentation PDF drawn for “${meta.name}”`)
            const result = renderPdfSlides(deck.template, deck.job, visible)
            drawn({ pages: result.pageCount, bytes: result.bytes.length, problems: result.problems })
            downloadBytes(result.bytes, documentFileName(meta.name || meta.title || deck.record.name, 'presentation'))
            if (result.problems.length) toast(result.problems[0]!, 'info')
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The presentation could not be exported.', 'critical')
        }
    }

    /* ------------------------------ keyboard -------------------------------- */

    const keys = useRef<(event: KeyboardEvent) => void>(() => {})
    keys.current = (event: KeyboardEvent) => {
        if (presenting !== null || isTyping(event.target) || document.querySelector('.tp-modal')) return
        const target = event.target as HTMLElement | null
        // An open menu has its own arrow keys and Escape.
        if (target?.closest?.('[role="menu"]')) return
        // Enter, Delete and the arrows belong to a focused button or choice; on the slide they move things.
        const onControl = Boolean(target?.closest?.('button, a, [role="radiogroup"]'))
        const mod = event.metaKey || event.ctrlKey
        const key = event.key.toLowerCase()

        if (mod && key === 's') {
            event.preventDefault()
            void save()
            return
        }
        if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
            event.preventDefault()
            history.redo()
            return
        }
        if (mod && key === 'z') {
            event.preventDefault()
            history.undo()
            return
        }
        if (event.key === 'F5') {
            event.preventDefault()
            present(event.shiftKey)
            return
        }
        const step = (by: number) => {
            const next = slides[index + by]
            if (next) choose(next.key)
        }
        if (event.key === 'PageDown' || (!selection.length && event.key === 'ArrowDown')) {
            event.preventDefault()
            step(1)
            return
        }
        if (event.key === 'PageUp' || (!selection.length && event.key === 'ArrowUp')) {
            event.preventDefault()
            step(-1)
            return
        }
        if (!editor || !custom) return

        const picked = custom.elements.filter(element => selection.includes(element.id))
        if (onControl && !mod) return
        if (mod && event.shiftKey && key === 'c' && picked.length === 1) {
            event.preventDefault()
            copiedStyle = styleOf(picked[0]!)
            toast('Formatting copied. Select something and press Ctrl+Shift+V to paste it.', 'info')
        } else if (mod && event.shiftKey && key === 'v' && copiedStyle && picked.length) {
            event.preventDefault()
            paint(selection, copiedStyle)
        } else if (mod && key === 'k' && picked.length === 1) {
            event.preventDefault()
            document.getElementById('tp-element-link')?.focus()
        } else if (event.key === 'Escape' && painter) {
            setPainter(null)
        } else if (mod && key === 'a') {
            event.preventDefault()
            setSelection(custom.elements.map(element => element.id))
        } else if (mod && (key === 'c' || key === 'x') && picked.length) {
            event.preventDefault()
            clipboard = structuredClone(picked)
            if (key === 'x') editor.remove()
        } else if (mod && key === 'v' && clipboard.length) {
            event.preventDefault()
            // Pasted where it was copied from when that place is free; offset when the original is still there.
            const onTop = clipboard.some(copied => custom.elements.some(element => element.id === copied.id))
            place(offsetCopies(clipboard, onTop ? 12 : 0))
        } else if (mod && key === 'd' && picked.length) {
            event.preventDefault()
            editor.duplicate()
        } else if (mod && (key === 'b' || key === 'i' || key === 'u') && picked.some(element => element.type === 'shape')) {
            event.preventDefault()
            const prop = key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline'
            const on = picked.every(element => element.type === 'shape' && element[prop])
            editor.patch(element => (element.type === 'shape' ? { [prop]: on ? undefined : true } : {}))
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && picked.length) {
            event.preventDefault()
            editor.remove()
        } else if (event.key.startsWith('Arrow') && picked.length) {
            event.preventDefault()
            const by = event.shiftKey ? 10 : 1
            const dx = event.key === 'ArrowLeft' ? -by : event.key === 'ArrowRight' ? by : 0
            const dy = event.key === 'ArrowUp' ? -by : event.key === 'ArrowDown' ? by : 0
            editor.patch(element => ({ x: element.x + dx, y: element.y + dy }), 'nudge')
        } else if (event.key === 'Enter' && picked.length === 1 && picked[0]!.type === 'shape') {
            event.preventDefault()
            setEditing(picked[0]!.id)
        } else if (event.key === 'Enter' && picked.length === 1 && picked[0]!.type === 'table') {
            event.preventDefault()
            setEditing(`${picked[0]!.id}#0,0`)
        } else if (event.key === 'Escape' && selection.length) {
            setSelection([])
        }
    }

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => keys.current(event)
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    /* -------------------------------- render -------------------------------- */

    if (loadError) {
        return (
            <div className="tp-page tp-page--narrow">
                <Notice kind="critical" title="This presentation could not be opened" lines={[loadError]} />
                <div>
                    <Button icon="arrowLeft" onClick={() => navigate('present')}>
                        Back to presentations
                    </Button>
                </div>
            </div>
        )
    }

    if (!meta) {
        return (
            <div className="tp-loading">
                <Spinner /> {opening || 'Opening…'}
            </div>
        )
    }

    if (presenting !== null && deck) {
        return (
            <Presenter
                template={deck.template}
                job={deck.job}
                title={meta.name || meta.title}
                slides={visible}
                startAt={presenting}
                onExit={() => {
                    setPresenting(null)
                    setPageTitle(meta.name || 'Slide builder')
                }}
                onExport={exportPdf}
                onEdit={() => setPresenting(null)}
                editLabel="Back to the builder"
                recordUrl={owner => {
                    const sysId = deck.job.records[owner]?.values['raw.sys_id']
                    return sysId ? `/${deck.schema.name}.do?sys_id=${encodeURIComponent(sysId)}` : null
                }}
            />
        )
    }

    const shownNumber = slide && !slide.hidden ? visible.findIndex(entry => entry.key === slide.key) + 1 : 0
    const ownerId = slide && slide.owner >= 0 ? deck?.job.records[slide.owner]?.values['raw.sys_id'] : undefined

    return (
        <div className="tp-builder">
            <header className="tp-editor__bar">
                <Button variant="ghost" icon="arrowLeft" onClick={() => guarded(() => navigate('present'))}>
                    Presentations
                </Button>
                <div className="tp-editor__identity">
                    <Input
                        className="tp-editor__name"
                        value={meta.name}
                        maxLength={100}
                        placeholder="Untitled presentation"
                        onChange={event => setMeta({ ...meta, name: event.target.value })}
                        aria-label="Presentation name"
                    />
                    {deck && (
                        <span className="tp-subtle tp-truncate">
                            {deck.record.name} · {deck.job.records.length} record{deck.job.records.length === 1 ? '' : 's'}
                        </span>
                    )}
                    {!record && <Badge tone="primary">New</Badge>}
                    {dirty && <Badge tone="warning">Unsaved</Badge>}
                </div>
                <div className="tp-row">
                    <Button icon="undo" variant="ghost" size="sm" disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)">
                        <span className="tp-sr-only">Undo</span>
                    </Button>
                    <Button icon="redo" variant="ghost" size="sm" disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Y)">
                        <span className="tp-sr-only">Redo</span>
                    </Button>
                    <Button icon="settings" onClick={() => setSettingsOpen(true)}>
                        Deck and records
                    </Button>
                    <Button icon="play" disabled={!deck || !visible.length} onClick={() => present(false)} title="Present from the start (F5)">
                        Present
                    </Button>
                    <Button icon="download" disabled={!deck} onClick={exportPdf}>
                        PDF
                    </Button>
                    <Button
                        variant="primary"
                        icon="save"
                        busy={saving}
                        disabled={!deck || (Boolean(record) && canChange && !dirty)}
                        onClick={() => void save(Boolean(record) && !canChange)}
                    >
                        {record && !canChange ? 'Save a copy' : 'Save'}
                    </Button>
                    <Menu
                        label="Presentation actions"
                        items={[
                            { label: 'Present from this slide', icon: 'play', disabled: !deck || !slide || slide.hidden === true, onSelect: () => present(true) },
                            { label: 'Save a copy', icon: 'copy', disabled: !deck || !record, onSelect: () => void save(true) },
                            ...(deck
                                ? [
                                      {
                                          label: 'Edit the deck template',
                                          icon: 'external' as const,
                                          onSelect: () => guarded(() => navigate('edit', { id: deck.record.sysId })),
                                      },
                                  ]
                                : []),
                            ...(record && canChange
                                ? [{ label: 'Delete presentation', icon: 'trash' as const, danger: true, onSelect: () => setConfirmDelete(true) }]
                                : []),
                        ]}
                    />
                </div>
            </header>

            <div className="tp-editor__notices">
                {record && !canChange && (
                    <Notice
                        kind="info"
                        lines={[`This is ${record.createdBy}’s presentation. Change what you like and save a copy of your own.`]}
                    />
                )}
                <Notice kind="critical" lines={saveError ? [saveError] : []} onDismiss={saveError ? () => setSaveError('') : undefined} />
                <Notice
                    kind="critical"
                    title={deckError ? 'The deck could not be loaded' : undefined}
                    lines={deckError ? [deckError] : []}
                />
                {deck && deck.matched > deck.job.records.length && (
                    <Notice
                        kind="info"
                        lines={[
                            `${deck.matched.toLocaleString()} records match; the first ${deck.job.records.length} have slides. Change the limit under Deck and records.`,
                        ]}
                    />
                )}
            </div>

            {!deck ? (
                <div className="tp-page tp-page--narrow">
                    {opening ? (
                        <div className="tp-loading">
                            <Spinner /> {opening}
                        </div>
                    ) : (
                        <EmptyState
                            icon="slides"
                            title={meta.templateId ? 'The deck is not loaded' : 'Choose a deck'}
                            action={
                                <Button variant="primary" icon="settings" onClick={() => setSettingsOpen(true)}>
                                    Choose the deck and records
                                </Button>
                            }
                        >
                            {meta.templateId
                                ? 'Its records could not be read. Check the deck and its filter.'
                                : 'A presentation is built on a deck template. Its custom slides are kept whichever deck it uses.'}
                        </EmptyState>
                    )}
                </div>
            ) : (
                <div className="tp-builder__body">
                    <aside className="tp-builder__sorter">
                        <div className="tp-builder__sorter-head">
                            <span>
                                {visible.length} of {slides.length} slide{slides.length === 1 ? '' : 's'} shown
                            </span>
                            <Menu
                                label="New slide"
                                icon="plus"
                                buttonLabel="New"
                                items={[
                                    ...(
                                        [
                                            ['titleContent', 'Title and content'],
                                            ['title', 'Title slide'],
                                            ['section', 'Section header'],
                                            ['twoContent', 'Two content'],
                                            ['titleOnly', 'Title only'],
                                            ['blank', 'Blank'],
                                        ] as const
                                    ).map(([layout, label]) => ({ label, onSelect: () => insert(index + 1, layout) })),
                                ]}
                            />
                        </div>
                        <SlideSorter
                            template={deck.template}
                            slides={slides}
                            current={current}
                            onSelect={choose}
                            onInsert={insert}
                            onMove={(from, to) => history.set(currentBody => moveSlide(currentBody, slides, from, to))}
                            onHide={(key, hidden) => history.set(currentBody => setHidden(currentBody, slides, key, hidden))}
                            onDuplicate={key => {
                                const made = duplicateSlide(body, slides, key)
                                history.set(made.body)
                                choose(made.key)
                            }}
                            onDelete={key => {
                                const next = slides[index + 1]?.key ?? slides[index - 1]?.key ?? ''
                                history.set(currentBody => deleteSlide(currentBody, slides, key))
                                if (key === current) choose(next)
                            }}
                        />
                    </aside>

                    <section className="tp-builder__stage">
                        {editor && <Ribbon editor={editor} />}
                        <Fit aspect={dims.width / dims.height}>
                            {canvasWidth =>
                                !slide ? null : custom && sheet ? (
                                    <SlideCanvas
                                        template={deck.template}
                                        slide={slide as Slide & { custom: CustomSlide }}
                                        sheet={sheet}
                                        width={canvasWidth}
                                        selection={selection}
                                        onSelect={setSelection}
                                        editing={editing}
                                        onEditing={setEditing}
                                        onChange={changeSlide}
                                        onDropImage={(file, at) => void placeImage(file, at)}
                                        painting={Boolean(painter)}
                                        onPaint={id => {
                                            paint([id], painter)
                                            setPainter(null)
                                            setSelection([id])
                                        }}
                                    />
                                ) : (
                                    <div className="tp-builder__locked">
                                        <SlideView template={deck.template} slide={slide} width={canvasWidth} />
                                    </div>
                                )
                            }
                        </Fit>
                        {slide && notesOpen && (
                            <div className="tp-builder__notes">
                                <Textarea
                                    key={slide.key}
                                    value={slideOptions?.notes ?? ''}
                                    maxLength={MAX_NOTES_LENGTH}
                                    rows={3}
                                    placeholder="Click to add speaker notes. They show in the presenter (press N), not on the slide or in the PDF."
                                    aria-label="Speaker notes"
                                    onChange={event => setNotes(event.target.value)}
                                />
                            </div>
                        )}
                        <footer className="tp-builder__status">
                            <span>
                                {slide?.hidden ? 'Hidden slide' : `Slide ${shownNumber} of ${visible.length}`}
                                {slide ? ` · ${slide.label}` : ''}
                            </span>
                            {painter && <Badge tone="primary">Format painter — click an element, Esc to stop</Badge>}
                            {slide?.hidden && (
                                <Button size="sm" variant="ghost" icon="eye" onClick={() => history.set(currentBody => setHidden(currentBody, slides, slide.key, false))}>
                                    Show it
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                icon="notes"
                                aria-pressed={notesOpen}
                                onClick={() => setNotesOpen(open => !open)}
                                title={notesOpen ? 'Hide speaker notes' : 'Show speaker notes'}
                            >
                                Notes
                            </Button>
                        </footer>
                    </section>

                    <aside className="tp-builder__inspector">
                        {editor && transition ? (
                            <Inspector editor={editor} transition={transition} />
                        ) : slide ? (
                            <div className="tp-inspector">
                                <section className="tp-inspector__section">
                                    <h3 className="tp-inspector__title">{slide.owner === -1 ? 'Title slide' : 'Record slide'}</h3>
                                    <p className="tp-muted">
                                        {slide.owner === -1
                                            ? 'The deck template’s title slide.'
                                            : `Drawn from ${slide.label} by the deck template, each time the presentation opens.`}{' '}
                                        Move it or hide it here; change what is on it in the template.
                                    </p>
                                    <div className="tp-stack tp-stack--tight">
                                        <Button
                                            icon={slide.hidden ? 'eye' : 'eyeOff'}
                                            onClick={() => history.set(currentBody => setHidden(currentBody, slides, slide.key, !slide.hidden))}
                                        >
                                            {slide.hidden ? 'Show slide' : 'Hide slide'}
                                        </Button>
                                        <Button icon="plus" onClick={() => insert(index + 1, 'titleContent')}>
                                            Add a slide after it
                                        </Button>
                                        {ownerId && (
                                            <a
                                                className="tp-btn tp-btn--ghost tp-btn--md"
                                                href={`/${deck.schema.name}.do?sys_id=${encodeURIComponent(ownerId)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <span>Open the record</span>
                                            </a>
                                        )}
                                    </div>
                                </section>
                                {transition && <TransitionSection control={transition} />}
                            </div>
                        ) : null}
                    </aside>
                </div>
            )}

            <input
                ref={imageInput}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                    const file = event.target.files?.[0]
                    if (file) void placeImage(file)
                    event.target.value = ''
                }}
            />

            {settingsOpen && (
                <SettingsModal
                    meta={meta}
                    onClose={() => setSettingsOpen(false)}
                    onApply={next => {
                        const reload =
                            next.templateId !== meta.templateId ||
                            next.query !== meta.query ||
                            next.orderBy !== meta.orderBy ||
                            next.limit !== meta.limit ||
                            next.title !== meta.title
                        setMeta(next)
                        setSettingsOpen(false)
                        if (reload && next.templateId) void openDeck(next)
                    }}
                />
            )}

            <ConfirmModal
                open={pending !== null}
                title="Leave without saving?"
                message="Your changes to this presentation have not been saved."
                confirmLabel="Discard changes"
                danger
                onConfirm={() => {
                    const go = pending
                    setPending(null)
                    setSaved(savedAs(meta, body))
                    go?.()
                }}
                onCancel={() => setPending(null)}
            />
            <ConfirmModal
                open={confirmDelete}
                title="Delete this presentation?"
                message={`“${record?.name ?? ''}” and its custom slides will be deleted for everyone. The deck template and its records are not touched.`}
                confirmLabel="Delete presentation"
                danger
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}

/**
 * The middle of the builder, measured: the slide drawn as large as fits.
 * Its own component so the measuring starts when it appears, which is after
 * the deck has loaded rather than when the view does.
 */
function Fit({ aspect, children }: { aspect: number; children: (width: number) => React.ReactNode }) {
    const area = useRef<HTMLDivElement>(null)
    const size = useElementSize(area)
    const width = Math.max(200, Math.floor(Math.min(size.width - 48, (size.height - 48) * aspect)))
    return (
        <div className="tp-builder__canvas" ref={area}>
            {size.width > 0 ? children(width) : null}
        </div>
    )
}

/* ---------------------------------------------------------------- settings */

/** Which deck the presentation is built on, which records get slides, and what it is called. */
function SettingsModal({ meta, onClose, onApply }: { meta: Meta; onClose: () => void; onApply: (meta: Meta) => void }) {
    const templates = useAsync(() => TemplateService.list(), [])
    const [draft, setDraft] = useState<Meta>(meta)
    const chosen = templates.data?.find(template => template.sysId === draft.templateId)
    const schema = useAsync(() => SchemaService.table(chosen!.table), [chosen?.table], Boolean(chosen))
    const selection: Selection = { mode: 'many', sysId: '', query: draft.query, orderBy: draft.orderBy, limit: draft.limit }
    const decks = (templates.data ?? []).filter(
        template => (template.kind === 'deck' && template.active) || template.sysId === draft.templateId
    )

    return (
        <Modal
            open
            size="lg"
            title="Deck and records"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" disabled={!draft.templateId} onClick={() => onApply(draft)}>
                        Apply
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <div className="tp-grid tp-grid--2">
                    <Field label="Presentation name">
                        <Input value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} />
                    </Field>
                    <Field label="Deck title" hint="Shown on the title slide as {{deck.title}}.">
                        <Input value={draft.title} maxLength={200} onChange={event => setDraft({ ...draft, title: event.target.value })} />
                    </Field>
                </div>
                <Field label="Deck template" hint="Its slides are drawn for each record. Custom slides stay whichever deck you choose.">
                    {templates.loading ? (
                        <p className="tp-row tp-subtle">
                            <Spinner size={14} /> Loading templates…
                        </p>
                    ) : (
                        <TemplateChooser
                            templates={decks}
                            value={draft.templateId}
                            onChange={template =>
                                setDraft({
                                    ...draft,
                                    templateId: template.sysId,
                                    // Another table's filter means nothing here: start from the deck's own.
                                    ...(template.table !== chosen?.table
                                        ? { query: template.query, orderBy: template.orderBy, limit: template.limit }
                                        : {}),
                                })
                            }
                            empty="No slide decks yet. Create one on the Templates page."
                        />
                    )}
                </Field>
                {schema.data ? (
                    <SelectionForm
                        schema={schema.data}
                        allowOne={false}
                        selection={selection}
                        onChange={next => setDraft({ ...draft, query: next.query, orderBy: next.orderBy, limit: next.limit })}
                    />
                ) : schema.loading ? (
                    <p className="tp-row tp-subtle">
                        <Spinner size={14} /> Reading the table…
                    </p>
                ) : null}
                <Notice kind="critical" lines={[templates.error, schema.error].filter(Boolean)} />
            </div>
        </Modal>
    )
}
