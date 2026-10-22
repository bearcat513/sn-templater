import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionModal, SettingsModal, type SectionDraft } from '../builder/BuilderDialogs'
import { Fit } from '../builder/Fit'
import { Inspector, type TransitionControl } from '../builder/Inspector'
import { savedAs, type Meta, type Saved } from '../builder/meta'
import {
    deleteSlide,
    duplicateSlide,
    hideSection,
    insertSection,
    insertSlide,
    moveSection,
    moveSlide,
    removeSection,
    setHidden,
    updateSection,
} from '../builder/operations'
import { Ribbon } from '../builder/Ribbon'
import { RecordSlideInspector, SectionInspector, SectionSummary } from '../builder/SectionPanels'
import { SlideCanvas } from '../builder/SlideCanvas'
import { SlideSorter } from '../builder/SlideSorter'
import { useBuilderKeys } from '../builder/useBuilderKeys'
import { useHistory } from '../builder/useHistory'
import { useSectionDecks } from '../builder/useSectionDecks'
import { useSlideEditor } from '../builder/useSlideEditor'
import { useCharts } from '../data/charts'
import {
    assemble,
    canChangePresentation,
    frameOf,
    loadDeck,
    recordLink,
    sourceOf,
    type DeckSource,
    type LoadedDeck,
} from '../data/deck'
import { openPictures, storePictures } from '../data/pictures'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { pageDimensions } from '../engine/pdf'
import {
    DEFAULT_TRANSITION,
    EMPTY_BODY,
    MAX_CUSTOM_SLIDES,
    MAX_NOTES_LENGTH,
    MAX_PRESENTATION_BODY_LENGTH,
    MAX_SECTIONS,
    applyTransitionToAll,
    customKey,
    layoutSlide,
    newId,
    orderOf,
    presentationChartIds,
    readPresentation,
    sectionKey,
    sectionOf,
    serializePresentation,
    withSlideOptions,
    type CustomSlide,
    type DeckSection,
    type PresentationBody,
    type SlideLayout,
} from '../engine/presentation'
import { renderPdfSlides, resolvePage } from '../engine/render'
import { documentFileName } from '../engine/tokens'
import { prepareFonts } from '../hooks/useFonts'
import { downloadBytes } from '../hooks/usePdf'
import { replaceUrl, setPageTitle, type Navigate } from '../hooks/useRoute'
import { assertUnchanged, ConflictError } from '../services/http'
import { PRESENTATION_TABLE, PresentationService, type PresentationRecord } from '../services/presentations'
import { ConflictModal } from '../ui/ConflictModal'
import { useLocalDraft } from '../hooks/useLocalDraft'
import { arrange, shown, type Slide } from '../slides/paginate'
import { Presenter } from '../slides/Presenter'
import { SlideView } from '../slides/SlideView'
import { Badge, Button, EmptyState, Input, Notice, Spinner, Textarea } from '../ui/controls'
import { ConfirmModal, Menu, useToast } from '../ui/overlays'
import { NarrowNotice } from '../ui/NarrowNotice'

/**
 * The slide builder: a deck's slides in a running order of the author's own,
 * with custom slides — blank ones, laid out by hand — slotted in anywhere,
 * saved as a presentation to open and present again.
 *
 * `?view=build&id=…` opens a saved presentation; `?view=build&template=…`
 * (with `query`, `order`, `limit` and `title`) starts a new one on a deck;
 * `?view=build` alone starts a blank one, from a title slide. Any of them
 * can place templates' slides in sections of their own, anywhere.
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
    const [presenting, setPresenting] = useState<number | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [pending, setPending] = useState<(() => void) | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [conflict, setConflict] = useState<ConflictError | null>(null)
    const [notesOpen, setNotesOpen] = useState(true)
    /** The section dialog: placing a template at a gap, or changing a placed one. */
    const [sectionDialog, setSectionDialog] = useState<{ at: number } | { id: string } | null>(null)

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
                setMeta(current =>
                    current && !current.name ? { ...current, name: current.title || loaded.record.name } : current
                )
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
                nextBody = await openPictures(readPresentation(found.body ?? ''), PRESENTATION_TABLE, found.sysId)
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
                // Built from nothing: a title slide to start on, as PowerPoint opens.
                if (!templateId) {
                    const frame = frameOf(null)
                    const first = layoutSlide('title', {
                        ...pageDimensions(frame.page.size, frame.page.landscape),
                        page: resolvePage(frame),
                    })
                    nextBody = { ...EMPTY_BODY, slides: [first], order: [{ key: customKey(first.id) }] }
                }
                setPageTitle('New presentation')
            }
            setMeta(nextMeta)
            history.reset(nextBody)
            setSaved(savedAs(nextMeta, nextBody))
            if (nextMeta.templateId) await openDeck(nextMeta)
            else setOpening('')
        })().catch(failure => live && setLoadError(failure instanceof Error ? failure.message : String(failure)))
        return () => {
            live = false
        }
        // Opened once per mount; the view is remounted when its address changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /* ------------------------------- the slides ----------------------------- */

    const sections = body.sections
    const { decks: sectionDecks, pending: sectionsPending } = useSectionDecks(sections, session, Boolean(meta))

    // A deck built on a template waits for it; one built from nothing is ready as it is.
    const ready = Boolean(meta) && (!meta?.templateId || Boolean(deck))
    const deckTitle = meta ? meta.title || meta.name : ''

    // Charts placed on custom slides are counted as they are placed, and join the deck's own.
    const charts = useCharts(useMemo(() => presentationChartIds(body), [body]))
    const assembled = useMemo(
        () => (ready ? assemble(deck, deckTitle, session, sections ?? [], sectionDecks, charts) : null),
        [ready, deck, deckTitle, session, sections, sectionDecks, charts]
    )
    const frame = assembled?.frame ?? null
    const job = assembled?.job ?? null
    const slides = useMemo(
        () => (assembled ? arrange(assembled.generated, assembled.job, body) : []),
        [assembled, body]
    )
    const visible = useMemo(() => shown(slides), [slides])

    useEffect(() => {
        if (slides.length && !slides.some(slide => slide.key === current)) setCurrent(slides[0]!.key)
    }, [slides, current])

    const index = slides.findIndex(slide => slide.key === current)
    const slide: Slide | undefined = slides[index]
    const custom = slide?.custom
    const marker = slide?.marker
    const markerDeck = marker ? sectionDecks[marker.id] : undefined

    const page = frame ? resolvePage(frame) : null
    const dims = page ? pageDimensions(page.size, page.landscape) : { width: 960, height: 540 }
    // The page is the frame's, so the frame is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sheet = useMemo(() => (page ? { ...dims, page } : null), [frame])

    const imageInput = useRef<HTMLInputElement>(null)
    const slideEditor = useSlideEditor({ custom, sheet, setBody: history.set, imageInput, toast })
    const { editor, selection, setSelection, editing, setEditing, painter, setPainter, changeSlide, paint } =
        slideEditor

    const choose = (key: string) => {
        setCurrent(key)
        slideEditor.reset()
    }

    const dirty = Boolean(meta) && (body !== saved.body || JSON.stringify(meta) !== saved.meta)
    const canChange = canChangePresentation(record, session)

    // Unsaved work on a saved presentation is kept in this browser until it is saved.
    const unsaved = useMemo(() => (meta ? { meta, body } : null), [meta, body])
    const local = useLocalDraft(
        record && canChange ? `presentation:${record.sysId}` : null,
        unsaved,
        dirty,
        record?.modCount ?? 0
    )
    const leftOver = Boolean(
        local.found?.value &&
            (JSON.stringify(local.found.value.meta) !== saved.meta ||
                JSON.stringify(local.found.value.body) !== JSON.stringify(saved.body))
    )
    useEffect(() => {
        if (local.found && !leftOver) local.dismiss()
    }, [local, leftOver])

    useInspect('builder.record', record)
    useInspect('builder.meta', meta)
    useInspect('builder.body', body)
    useInspect(
        'builder.slides',
        useMemo(() => slides.map(entry => ({ key: entry.key, label: entry.label, hidden: entry.hidden })), [slides])
    )

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

    /* --------------------------------- sections ----------------------------- */

    const openSectionDialog = (at: number) => {
        if ((sections ?? []).length >= MAX_SECTIONS) {
            toast(`A presentation can place at most ${MAX_SECTIONS} templates.`, 'critical')
            return
        }
        setSectionDialog({ at })
    }

    const applySection = (draft: SectionDraft) => {
        const dialog = sectionDialog
        setSectionDialog(null)
        if (!dialog) return
        if ('id' in dialog) {
            history.set(currentBody => updateSection(currentBody, dialog.id, draft))
            return
        }
        const section: DeckSection = { id: newId(), ...draft }
        history.set(currentBody => insertSection(currentBody, slides, dialog.at, section))
        choose(sectionKey(section.id))
    }

    const dropSection = (id: string) => {
        if (sectionOf(current) === id) {
            const next =
                slides.find((entry, at) => at > index && sectionOf(entry.key) !== id) ??
                slides.find(entry => sectionOf(entry.key) !== id)
            choose(next?.key ?? '')
        }
        history.set(currentBody => removeSection(currentBody, slides, id))
    }

    /* --------------------------- notes and transitions ---------------------- */

    const slideOptions = slide ? body.options?.[slide.key] : undefined
    const transition: TransitionControl | null =
        slide && !slide.marker
            ? {
                  value: slideOptions?.transition,
                  deck: body.transition ?? DEFAULT_TRANSITION,
                  onChange: next =>
                      history.set(currentBody => withSlideOptions(currentBody, slide.key, { transition: next })),
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
        async (options: { asCopy?: boolean; force?: boolean } = {}) => {
            if (!meta || saving || !assembled) return
            const asCopy = options.asCopy === true
            const name = meta.name.trim() || meta.title.trim() || deck?.record.name || 'Untitled presentation'
            const updating = Boolean(record && !asCopy && canChange)
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
                }
                // Pictures are attachments of the presentation, so a new one is made first and given them after.
                if (updating && !options.force)
                    await assertUnchanged(PRESENTATION_TABLE, record!.sysId, record!.modCount)
                const target = updating ? record! : await PresentationService.create({ ...input, body: '' })
                // The order as the author saw it, record slides placed by the arrangement included.
                const ordered = readPresentation(serializePresentation({ ...body, order: orderOf(slides) }))
                const text = JSON.stringify(await storePictures(ordered, PRESENTATION_TABLE, target.sysId))
                if (text.length > MAX_PRESENTATION_BODY_LENGTH) {
                    throw new Error(
                        `This presentation is too large to save (${Math.round(text.length / 1000).toLocaleString()} kB of ${
                            MAX_PRESENTATION_BODY_LENGTH / 1000
                        } kB). Remove some slides or elements.`
                    )
                }
                const stored = await PresentationService.update(target.sysId, { ...input, body: text })
                const nextMeta = { ...meta, name: stored.name }
                setRecord(stored)
                setMeta(nextMeta)
                setSaved(savedAs(nextMeta, body))
                local.clear()
                replaceUrl('build', { id: stored.sysId })
                setPageTitle(stored.name)
                log.info('builder', `Saved “${stored.name}”`, { sysId: stored.sysId, bodyLength: text.length })
                toast(updating ? 'Presentation saved.' : `Saved “${stored.name}”.`)
            } catch (failure) {
                if (failure instanceof ConflictError) {
                    setConflict(failure)
                    return
                }
                const { message, data } = describeError(failure)
                log.error('builder', `Save failed: ${message}`, data)
                setSaveError(failure instanceof Error ? failure.message : 'The presentation could not be saved.')
            } finally {
                setSaving(false)
            }
        },
        [meta, saving, assembled, deck, body, slides, record, canChange, toast, local]
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
        // From a section's header, its first slide shown.
        const from =
            fromCurrent && slide ? slides.slice(index).find(entry => !entry.hidden && !entry.marker) : undefined
        const at = from ? visible.findIndex(entry => entry.key === from.key) : 0
        setEditing(null)
        setPresenting(Math.max(0, at))
    }

    const exportPdf = async () => {
        if (!frame || !job || !meta) return
        try {
            await prepareFonts(frame, job, visible)
            const drawn = log.time('render', `Presentation PDF drawn for “${meta.name}”`)
            const result = renderPdfSlides(frame, job, visible)
            drawn({ pages: result.pageCount, bytes: result.bytes.length, problems: result.problems })
            downloadBytes(
                result.bytes,
                documentFileName(meta.name || meta.title || deck?.record.name || 'Presentation', 'presentation')
            )
            if (result.problems.length) toast(result.problems[0]!, 'info')
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The presentation could not be exported.', 'critical')
        }
    }

    /* ------------------------------ keyboard -------------------------------- */

    useBuilderKeys({
        presenting: presenting !== null,
        slides,
        index,
        choose,
        save: () => void save(),
        undo: history.undo,
        redo: history.redo,
        present,
        editor,
        custom,
        selection,
        setSelection,
        setEditing,
        painter,
        setPainter,
        paint,
        place: slideEditor.place,
        toast,
    })

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

    if (presenting !== null && frame && job) {
        return (
            <Presenter
                template={frame}
                job={job}
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
                recordUrl={recordLink}
            />
        )
    }

    const shownNumber = slide && !slide.hidden ? visible.findIndex(entry => entry.key === slide.key) + 1 : 0
    const slideCount = slides.filter(entry => !entry.marker).length
    // New slides go after the current one — after the whole section, when that is a section's header.
    const nextGap = marker
        ? slides.reduce((at, entry, position) => (sectionOf(entry.key) === marker.id ? position + 1 : at), index + 1)
        : index + 1
    const ownerLink = slide ? recordLink(slide) : null
    /** The template a generated slide comes from: a section's, or the deck's. */
    const slideSection =
        slide && !custom ? (sections ?? []).find(section => section.id === sectionOf(slide.key)) : undefined
    const sectionNotices = (sections ?? []).flatMap(section => {
        const loaded = sectionDecks[section.id]
        const name = loaded?.deck?.record.name ?? section.name ?? 'A template'
        if (loaded?.error) return [`“${name}” could not be loaded: ${loaded.error}`]
        const shownCount = loaded?.deck?.job.records.length ?? 0
        if (loaded?.deck && loaded.deck.matched > shownCount)
            return [
                `“${name}”: ${loaded.deck.matched.toLocaleString()} records match; the first ${shownCount} have slides.`,
            ]
        return []
    })

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
                    {(deck || !meta.templateId) && (
                        <span className="tp-subtle tp-truncate">
                            {deck
                                ? `${deck.record.name} · ${deck.job.records.length} record${deck.job.records.length === 1 ? '' : 's'}`
                                : 'Blank deck'}
                            {sections?.length
                                ? ` · ${sections.length} template${sections.length === 1 ? '' : 's'} placed`
                                : ''}
                        </span>
                    )}
                    {!record && <Badge tone="primary">New</Badge>}
                    {dirty && <Badge tone="warning">Unsaved</Badge>}
                </div>
                <div className="tp-row">
                    <Button
                        icon="undo"
                        variant="ghost"
                        size="sm"
                        disabled={!history.canUndo}
                        onClick={history.undo}
                        title="Undo (Ctrl+Z)"
                    >
                        <span className="tp-sr-only">Undo</span>
                    </Button>
                    <Button
                        icon="redo"
                        variant="ghost"
                        size="sm"
                        disabled={!history.canRedo}
                        onClick={history.redo}
                        title="Redo (Ctrl+Y)"
                    >
                        <span className="tp-sr-only">Redo</span>
                    </Button>
                    <Button icon="settings" onClick={() => setSettingsOpen(true)}>
                        Deck and records
                    </Button>
                    <Button
                        icon="play"
                        disabled={!assembled || !visible.length}
                        onClick={() => present(false)}
                        title="Present from the start (F5)"
                    >
                        Present
                    </Button>
                    <Button icon="download" disabled={!assembled} onClick={exportPdf}>
                        PDF
                    </Button>
                    <Button
                        variant="primary"
                        icon="save"
                        busy={saving}
                        disabled={!assembled || (Boolean(record) && canChange && !dirty)}
                        onClick={() => void save({ asCopy: Boolean(record) && !canChange })}
                    >
                        {record && !canChange ? 'Save a copy' : 'Save'}
                    </Button>
                    <Menu
                        label="Presentation actions"
                        items={[
                            {
                                label: 'Present from this slide',
                                icon: 'play',
                                disabled: !assembled || !slide || slide.hidden === true,
                                onSelect: () => present(true),
                            },
                            {
                                label: 'Save a copy',
                                icon: 'copy',
                                disabled: !assembled || !record,
                                onSelect: () => void save({ asCopy: true }),
                            },
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
                                ? [
                                      {
                                          label: 'Delete presentation',
                                          icon: 'trash' as const,
                                          danger: true,
                                          onSelect: () => setConfirmDelete(true),
                                      },
                                  ]
                                : []),
                        ]}
                    />
                </div>
            </header>

            <div className="tp-editor__notices">
                {record && !canChange && (
                    <Notice
                        kind="info"
                        lines={[
                            `This is ${record.createdBy}’s presentation. Change what you like and save a copy of your own.`,
                        ]}
                    />
                )}
                <Notice
                    kind="critical"
                    lines={saveError ? [saveError] : []}
                    onDismiss={saveError ? () => setSaveError('') : undefined}
                />
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
                <Notice kind="info" lines={sectionNotices} />
                {leftOver && local.found?.value && (
                    <Notice
                        kind="warning"
                        title="Unsaved changes from earlier"
                        lines={[
                            `Changes you made on ${new Date(local.found.savedAt).toLocaleString()} were never saved, and were kept in this browser.`,
                        ]}
                    >
                        <div className="tp-row">
                            <Button
                                size="sm"
                                variant="primary"
                                icon="undo"
                                onClick={() => {
                                    const kept = local.found!.value!
                                    setMeta(kept.meta)
                                    history.set(kept.body)
                                    local.dismiss()
                                }}
                            >
                                Restore them
                            </Button>
                            <Button size="sm" variant="ghost" onClick={local.dismiss}>
                                Throw them away
                            </Button>
                        </div>
                    </Notice>
                )}
            </div>

            {!assembled || !frame || sectionsPending ? (
                <div className="tp-page tp-page--narrow">
                    {opening || (assembled && sectionsPending) ? (
                        <div className="tp-loading">
                            <Spinner /> {opening || 'Reading the templates’ records…'}
                        </div>
                    ) : (
                        <EmptyState
                            icon="slides"
                            title="The deck is not loaded"
                            action={
                                <Button variant="primary" icon="settings" onClick={() => setSettingsOpen(true)}>
                                    Choose the deck and records
                                </Button>
                            }
                        >
                            Its records could not be read. Check the deck and its filter, or build the presentation
                            without a deck.
                        </EmptyState>
                    )}
                </div>
            ) : (
                <>
                    <NarrowNotice editor="builder">
                        <Button icon="play" disabled={!visible.length} onClick={() => present(false)}>
                            Present
                        </Button>
                        <Button icon="download" onClick={() => void exportPdf()}>
                            PDF
                        </Button>
                    </NarrowNotice>
                    <div className="tp-builder__body tp-wide-only--builder">
                        <aside className="tp-builder__sorter">
                            <div className="tp-builder__sorter-head">
                                <span>
                                    {visible.length} of {slideCount} slide{slideCount === 1 ? '' : 's'} shown
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
                                        ).map(([layout, label]) => ({
                                            label,
                                            onSelect: () => insert(nextGap, layout),
                                        })),
                                        {
                                            label: 'A template’s slides…',
                                            icon: 'layers' as const,
                                            onSelect: () => openSectionDialog(nextGap),
                                        },
                                    ]}
                                />
                            </div>
                            <SlideSorter
                                template={frame}
                                slides={slides}
                                current={current}
                                onSelect={choose}
                                onInsert={insert}
                                onMove={(from, to) =>
                                    history.set(currentBody => moveSlide(currentBody, slides, from, to))
                                }
                                onHide={(key, hidden) =>
                                    history.set(currentBody => setHidden(currentBody, slides, key, hidden))
                                }
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
                                onInsertSection={openSectionDialog}
                                onMoveSection={(id, gap) =>
                                    history.set(currentBody => moveSection(currentBody, slides, id, gap))
                                }
                                onHideSection={(id, hidden) =>
                                    history.set(currentBody => hideSection(currentBody, slides, id, hidden))
                                }
                                onRemoveSection={dropSection}
                            />
                        </aside>

                        <section className="tp-builder__stage">
                            {editor && <Ribbon editor={editor} />}
                            <Fit aspect={dims.width / dims.height}>
                                {canvasWidth =>
                                    !slide ? null : marker ? (
                                        <SectionSummary
                                            width={canvasWidth}
                                            aspect={dims.width / dims.height}
                                            name={slide.label}
                                            loaded={markerDeck}
                                            count={
                                                slides.filter(
                                                    entry => !entry.marker && sectionOf(entry.key) === marker.id
                                                ).length
                                            }
                                        />
                                    ) : custom && sheet ? (
                                        <SlideCanvas
                                            template={frame}
                                            slide={slide as Slide & { custom: CustomSlide }}
                                            sheet={sheet}
                                            width={canvasWidth}
                                            selection={selection}
                                            onSelect={setSelection}
                                            editing={editing}
                                            onEditing={setEditing}
                                            onChange={changeSlide}
                                            onDropImage={(file, at) => void slideEditor.placeImage(file, at)}
                                            painting={Boolean(painter)}
                                            onPaint={id => {
                                                paint([id], painter)
                                                setPainter(null)
                                                setSelection([id])
                                            }}
                                        />
                                    ) : (
                                        <div className="tp-builder__locked">
                                            <SlideView template={frame} slide={slide} width={canvasWidth} />
                                        </div>
                                    )
                                }
                            </Fit>
                            {slide && !marker && notesOpen && (
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
                                    {marker
                                        ? 'Section'
                                        : slide?.hidden
                                          ? 'Hidden slide'
                                          : `Slide ${shownNumber} of ${visible.length}`}
                                    {slide ? ` · ${slide.label}` : ''}
                                </span>
                                {painter && (
                                    <Badge tone="primary">Format painter — click an element, Esc to stop</Badge>
                                )}
                                {slide?.hidden && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon="eye"
                                        onClick={() =>
                                            history.set(currentBody => setHidden(currentBody, slides, slide.key, false))
                                        }
                                    >
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
                            ) : marker ? (
                                <SectionInspector
                                    section={marker}
                                    name={slide!.label}
                                    loaded={markerDeck}
                                    slides={slides.filter(entry => !entry.marker && sectionOf(entry.key) === marker.id)}
                                    onRename={name =>
                                        history.set(
                                            currentBody => updateSection(currentBody, marker.id, { name }),
                                            `section:${marker.id}`
                                        )
                                    }
                                    onChange={() => setSectionDialog({ id: marker.id })}
                                    onHide={hidden =>
                                        history.set(currentBody => hideSection(currentBody, slides, marker.id, hidden))
                                    }
                                    onRemove={() => dropSection(marker.id)}
                                    onEditTemplate={() => guarded(() => navigate('edit', { id: marker.template }))}
                                />
                            ) : slide ? (
                                <RecordSlideInspector
                                    slide={slide}
                                    templateName={
                                        slideSection
                                            ? (sectionDecks[slideSection.id]?.deck?.record.name ??
                                              slideSection.name ??
                                              'its template')
                                            : null
                                    }
                                    link={ownerLink}
                                    transition={transition}
                                    onToggleHidden={() =>
                                        history.set(currentBody =>
                                            setHidden(currentBody, slides, slide.key, !slide.hidden)
                                        )
                                    }
                                    onAddAfter={() => insert(index + 1, 'titleContent')}
                                />
                            ) : null}
                        </aside>
                    </div>
                </>
            )}

            <input
                ref={imageInput}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                    const file = event.target.files?.[0]
                    if (file) void slideEditor.placeImage(file)
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
                        if (!next.templateId) {
                            // Built from nothing from now on: the custom slides and sections stay.
                            setDeck(null)
                            setDeckError('')
                        } else if (reload) void openDeck(next)
                    }}
                />
            )}

            {sectionDialog && (
                <SectionModal
                    section={
                        'id' in sectionDialog ? sections?.find(section => section.id === sectionDialog.id) : undefined
                    }
                    onClose={() => setSectionDialog(null)}
                    onApply={applySection}
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
                    local.clear()
                    go?.()
                }}
                onCancel={() => setPending(null)}
            />
            <ConflictModal
                conflict={conflict}
                what="presentation"
                onClose={() => setConflict(null)}
                onReload={() => {
                    setConflict(null)
                    setSaved(savedAs(meta, body))
                    navigate('build', { id: record?.sysId, reopen: String(Date.now()) }, { replace: true })
                }}
                onOverwrite={() => {
                    setConflict(null)
                    void save({ force: true })
                }}
                onSaveCopy={() => {
                    setConflict(null)
                    void save({ asCopy: true })
                }}
            />
            <ConfirmModal
                open={confirmDelete}
                title="Delete this presentation?"
                message={`“${record?.name ?? ''}” and its custom slides will be deleted for everyone. The templates it uses and their records are not touched.`}
                confirmLabel="Delete presentation"
                danger
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}
