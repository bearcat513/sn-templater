import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionModal, SettingsModal, type SectionDraft } from '../builder/BuilderDialogs'
import { Fit } from '../builder/Fit'
import { Inspector, type TransitionControl } from '../builder/Inspector'
import { duplicateSlide } from '../builder/operations'
import { Ribbon } from '../builder/Ribbon'
import { RecordSlideInspector, SectionInspector, SectionSummary } from '../builder/SectionPanels'
import { SlideCanvas } from '../builder/SlideCanvas'
import { SlideSorter } from '../builder/SlideSorter'
import { useBuilderKeys } from '../builder/useBuilderKeys'
import { useHistory } from '../builder/useHistory'
import { reduceBody, type BodyAction } from '../builder/reducer'
import { useBuilderPersistence, type SaveMode } from '../builder/useBuilderPersistence'
import { PresentationHistory } from '../builder/PresentationHistory'
import { ShareModal } from '../builder/ShareModal'
import { CommentsPanel } from '../builder/CommentsPanel'
import { CommentService, type SlideComment } from '../services/collaboration'
import { PresentationService } from '../services/presentations'
import { ownsPresentation } from '../data/deck'
import { PublishModal } from '../designer/PublishModal'
import { droppedNote } from './common'
import { useSectionDecks } from '../builder/useSectionDecks'
import { useSlideEditor } from '../builder/useSlideEditor'
import { useCharts } from '../data/charts'
import { assemble, recordLink } from '../data/deck'
import { useSession } from '../data/session'
import { log, useInspect } from '../debug/log'
import { pageDimensions } from '../engine/pdf'
import {
    DEFAULT_TRANSITION,
    EMPTY_BODY,
    MAX_CUSTOM_SLIDES,
    MAX_NOTES_LENGTH,
    MAX_SECTIONS,
    customKey,
    layoutSlide,
    newId,
    presentationChartIds,
    sectionKey,
    sectionOf,
    type CustomSlide,
    type DeckSection,
    type PresentationBody,
    type SlideLayout,
} from '../engine/presentation'
import { renderPdfSlides, resolvePage } from '../engine/render'
import { documentFileName } from '../engine/tokens'
import { prepareFonts } from '../hooks/useFonts'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { ConflictModal } from '../ui/ConflictModal'
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
    const history = useHistory<PresentationBody>(EMPTY_BODY)
    const body = history.value
    const { set: setBody, reset: resetBody } = history
    /** Every change to the body, as a named action (see ../builder/reducer.ts). */
    const dispatch = useCallback(
        (action: BodyAction, merge?: string) => setBody(currentBody => reduceBody(currentBody, action), merge),
        [setBody]
    )
    const replaceBody = useCallback((next: PresentationBody) => dispatch({ type: 'replace', body: next }), [dispatch])
    const persistence = useBuilderPersistence({ params, body, reset: resetBody, replaceBody, toast })
    const {
        record,
        meta,
        setMeta,
        deck,
        setDeck,
        openDeck,
        opening,
        loadError,
        deckError,
        setDeckError,
        dirty,
        canChange,
        publishesOnSave,
        unpublished,
        saving,
        saveError,
        setSaveError,
        conflict,
        setConflict,
        local,
        leftOver,
    } = persistence
    const [current, setCurrent] = useState('')
    const [presenting, setPresenting] = useState<number | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [pending, setPending] = useState<(() => void) | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [notesOpen, setNotesOpen] = useState(true)
    const [commentsOpen, setCommentsOpen] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)
    const [sharing, setSharing] = useState(false)
    const [comments, setComments] = useState<SlideComment[]>([])
    const [commentsState, setCommentsState] = useState({ loading: false, error: '' })
    /** The section dialog: placing a template at a gap, or changing a placed one. */
    const [sectionDialog, setSectionDialog] = useState<{ at: number } | { id: string } | null>(null)

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

    // Comments are read once the presentation is saved, and kept here as they are added and resolved.
    const presentationId = record?.sysId ?? ''
    useEffect(() => {
        if (!presentationId) return
        let live = true
        setCommentsState({ loading: true, error: '' })
        CommentService.list(presentationId)
            .then(found => live && (setComments(found), setCommentsState({ loading: false, error: '' })))
            .catch(
                failure =>
                    live &&
                    setCommentsState({
                        loading: false,
                        error: failure instanceof Error ? failure.message : 'Comments could not be read.',
                    })
            )
        return () => {
            live = false
        }
    }, [presentationId])

    const share = async (editors: string[], editorGroups: string[]) => {
        if (!record) return
        setSharing(true)
        try {
            persistence.setRecord(await PresentationService.update(record.sysId, { editors, editorGroups }))
            setShareOpen(false)
            toast(
                editors.length || editorGroups.length
                    ? 'Sharing saved. They can change this presentation now.'
                    : 'Only you and editors can change this presentation now.'
            )
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'Sharing could not be saved.', 'critical')
        } finally {
            setSharing(false)
        }
    }

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
        dispatch({ type: 'insertSlide', slides, at, slide: made })
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
            dispatch({ type: 'updateSection', id: dialog.id, change: draft })
            return
        }
        const section: DeckSection = { id: newId(), ...draft }
        dispatch({ type: 'insertSection', slides, at: dialog.at, section })
        choose(sectionKey(section.id))
    }

    const dropSection = (id: string) => {
        if (sectionOf(current) === id) {
            const next =
                slides.find((entry, at) => at > index && sectionOf(entry.key) !== id) ??
                slides.find(entry => sectionOf(entry.key) !== id)
            choose(next?.key ?? '')
        }
        dispatch({ type: 'removeSection', slides, id })
    }

    /* --------------------------- notes and transitions ---------------------- */

    const slideOptions = slide ? body.options?.[slide.key] : undefined
    const transition: TransitionControl | null =
        slide && !slide.marker
            ? {
                  value: slideOptions?.transition,
                  deck: body.transition ?? DEFAULT_TRANSITION,
                  onChange: next => dispatch({ type: 'slideOptions', key: slide.key, change: { transition: next } }),
                  onApplyAll: () => {
                      const chosen = slideOptions?.transition ?? body.transition ?? DEFAULT_TRANSITION
                      dispatch({ type: 'transitionAll', transition: chosen })
                      toast(`Every slide now comes in with ${chosen === 'none' ? 'no transition' : `a ${chosen}`}.`)
                  },
              }
            : null

    const setNotes = (notes: string) => {
        if (!slide) return
        const key = slide.key
        dispatch({ type: 'slideOptions', key, change: { notes } }, `notes:${key}`)
    }

    /* ------------------------------ saving ---------------------------------- */

    /** The last way a save was asked for, so a save over someone else's goes the same way. */
    const lastMode = useRef<SaveMode>({})
    const save = (mode: SaveMode = {}) => {
        if (!assembled) return
        lastMode.current = mode
        void persistence.save(slides, mode).then(done => done && setPublishing(false))
    }
    /** The Save button and Ctrl+S: a draft, unless the presentation has never been published. */
    const saveDraft = () => save({ asCopy: Boolean(record) && !canChange })

    const remove = async () => {
        setConfirmDelete(false)
        if (await persistence.remove()) navigate('present')
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
        save: saveDraft,
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
                    {!dirty && record?.hasDraft && <Badge tone="warning">Unpublished draft</Badge>}
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
                        variant={publishesOnSave || !canChange ? 'primary' : 'secondary'}
                        icon="save"
                        busy={saving && !publishing}
                        disabled={!assembled || saving || (Boolean(record) && canChange && !dirty)}
                        onClick={saveDraft}
                        title={
                            record && !canChange
                                ? 'Save a copy of your own'
                                : publishesOnSave
                                  ? 'Save and publish (Ctrl+S)'
                                  : 'Save a draft (Ctrl+S)'
                        }
                    >
                        {record && !canChange ? 'Save a copy' : 'Save'}
                    </Button>
                    {record && canChange && !publishesOnSave && (
                        <Button
                            variant="primary"
                            icon="publish"
                            disabled={!assembled || !unpublished || saving}
                            onClick={() => setPublishing(true)}
                        >
                            Publish
                        </Button>
                    )}
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
                                onSelect: () => save({ asCopy: true }),
                            },
                            ...(record
                                ? [
                                      {
                                          label: 'Published versions…',
                                          icon: 'history' as const,
                                          onSelect: () => setHistoryOpen(true),
                                      },
                                  ]
                                : []),
                            ...(record && ownsPresentation(record, session)
                                ? [
                                      {
                                          label: 'Share…',
                                          icon: 'users' as const,
                                          onSelect: () => setShareOpen(true),
                                      },
                                  ]
                                : []),
                            ...(record && canChange && record.hasDraft
                                ? [
                                      {
                                          label: 'Discard unpublished changes',
                                          icon: 'undo' as const,
                                          onSelect: () => setConfirmDiscard(true),
                                      },
                                  ]
                                : []),
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
                {record?.hasDraft && canChange && (
                    <Notice
                        kind="info"
                        lines={[
                            'You are looking at unpublished changes. The presentation’s link presents the published version until you publish.',
                        ]}
                    />
                )}
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
                            ...droppedNote(local.found.droppedPictures),
                        ]}
                    >
                        <div className="tp-row">
                            <Button size="sm" variant="primary" icon="undo" onClick={persistence.restoreLocal}>
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
                                onMove={(from, to) => dispatch({ type: 'moveSlide', slides, from, to })}
                                onHide={(key, hidden) => dispatch({ type: 'setHidden', slides, key, hidden })}
                                onDuplicate={key => {
                                    const made = duplicateSlide(body, slides, key)
                                    dispatch({ type: 'replace', body: made.body })
                                    choose(made.key)
                                }}
                                onDelete={key => {
                                    const next = slides[index + 1]?.key ?? slides[index - 1]?.key ?? ''
                                    dispatch({ type: 'deleteSlide', slides, key })
                                    if (key === current) choose(next)
                                }}
                                onInsertSection={openSectionDialog}
                                onMoveSection={(id, gap) => dispatch({ type: 'moveSection', slides, id, gap })}
                                onHideSection={(id, hidden) => dispatch({ type: 'hideSection', slides, id, hidden })}
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
                            {slide && !marker && commentsOpen && record && (
                                <CommentsPanel
                                    presentation={record.sysId}
                                    comments={comments}
                                    loading={commentsState.loading}
                                    error={commentsState.error}
                                    slide={slide.key}
                                    presentationAuthor={record.createdBy}
                                    onChange={setComments}
                                />
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
                                            dispatch({ type: 'setHidden', slides, key: slide.key, hidden: false })
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
                                {record && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon="comment"
                                        aria-pressed={commentsOpen}
                                        onClick={() => setCommentsOpen(open => !open)}
                                        title={commentsOpen ? 'Hide comments' : 'Show comments on this slide'}
                                    >
                                        Comments
                                        {slide && openComments(comments, slide.key)
                                            ? ` (${openComments(comments, slide.key)})`
                                            : ''}
                                    </Button>
                                )}
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
                                        dispatch(
                                            { type: 'updateSection', id: marker.id, change: { name } },
                                            `section:${marker.id}`
                                        )
                                    }
                                    onChange={() => setSectionDialog({ id: marker.id })}
                                    onHide={hidden => dispatch({ type: 'hideSection', slides, id: marker.id, hidden })}
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
                                        dispatch({ type: 'setHidden', slides, key: slide.key, hidden: !slide.hidden })
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
                    persistence.forget()
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
                    persistence.forget()
                    navigate('build', { id: record?.sysId, reopen: String(Date.now()) }, { replace: true })
                }}
                onOverwrite={() => {
                    setConflict(null)
                    save({ ...lastMode.current, force: true })
                }}
                onSaveCopy={() => {
                    setConflict(null)
                    save({ asCopy: true })
                }}
            />
            <PublishModal
                open={publishing}
                version={(record?.version ?? 0) + 1}
                busy={saving}
                message="Everyone who opens this presentation’s link sees these changes from now on. The version they replace stays in its history."
                onClose={() => setPublishing(false)}
                onPublish={note => save({ publish: true, note })}
            />
            {shareOpen && record && (
                <ShareModal
                    editors={record.editors}
                    editorGroups={record.editorGroups}
                    busy={sharing}
                    onClose={() => setShareOpen(false)}
                    onSave={(editors, editorGroups) => void share(editors, editorGroups)}
                />
            )}
            {historyOpen && record && (
                <PresentationHistory
                    sysId={record.sysId}
                    canChange={canChange}
                    onClose={() => setHistoryOpen(false)}
                    onRestore={persistence.restoreVersion}
                />
            )}
            <ConfirmModal
                open={confirmDiscard}
                title="Discard unpublished changes?"
                message="The draft is deleted and the builder goes back to the published version. This cannot be undone."
                confirmLabel="Discard changes"
                danger
                onConfirm={() => {
                    setConfirmDiscard(false)
                    void persistence.discardDraft()
                }}
                onCancel={() => setConfirmDiscard(false)}
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

/** Comments on a slide not yet resolved. */
const openComments = (comments: SlideComment[], slide: string): number =>
    comments.filter(comment => comment.slide === slide && !comment.resolved).length
