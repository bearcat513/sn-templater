import { useCallback, useEffect, useMemo, useState } from 'react'
import { canChangePresentation, frameOf, loadDeck, sourceOf, type DeckSource, type LoadedDeck } from '../data/deck'
import { openPictures, storePictures } from '../data/pictures'
import { useSession } from '../data/session'
import { describeError, log } from '../debug/log'
import { pageDimensions } from '../engine/pdf'
import {
    EMPTY_BODY,
    MAX_PRESENTATION_BODY_LENGTH,
    customKey,
    layoutSlide,
    orderOf,
    readPresentation,
    serializePresentation,
    type PresentationBody,
} from '../engine/presentation'
import { resolvePage } from '../engine/render'
import { useLocalDraft } from '../hooks/useLocalDraft'
import { replaceUrl, setPageTitle } from '../hooks/useRoute'
import { ConflictError } from '../services/http'
import {
    PRESENTATION_TABLE,
    PresentationService,
    type PresentationInput,
    type PresentationRecord,
    type PresentationVersion,
} from '../services/presentations'
import type { Slide } from '../slides/paginate'
import { savedAs, type Meta, type Saved } from './meta'

/** How a save goes: kept as a draft, or published — and over someone else's save, or as a copy. */
export type SaveMode = { publish?: boolean; note?: string; force?: boolean; asCopy?: boolean }

/** What is kept of unsaved work in the browser. */
type Unsaved = { meta: Meta; body: PresentationBody }

/** A draft as it is stored: the body, with the deck's settings it changes under `meta`. */
type StoredDraft = PresentationBody & { meta?: Partial<Meta> }

/** The presentation and its deck settings as the builder opens them: its draft when it has one. */
function opened(record: PresentationRecord): { meta: Meta; body: PresentationBody; fromDraft: boolean } {
    const published = { ...sourceOf(record), name: record.name }
    let draft: StoredDraft | null = null
    try {
        draft = record.draftBody ? (JSON.parse(record.draftBody) as StoredDraft) : null
    } catch {
        draft = null
    }
    if (!draft) return { meta: published, body: readPresentation(record.body ?? ''), fromDraft: false }
    const { meta: kept, ...body } = draft
    return {
        meta: { ...published, ...(kept ?? {}), name: record.name },
        body: readPresentation(body),
        fromDraft: true,
    }
}

/**
 * Opening, saving and publishing a presentation in the slide builder.
 *
 * Like a template, a presentation has a published body — what its link
 * presents — and unpublished changes saved in the builder. The builder opens
 * the changes when there are some. **Save** keeps a draft, which carries the
 * deck's settings with it, so publishing changes everything at once;
 * **Publish** makes it what the link presents and numbers a version. A
 * presentation never published publishes on its first save, as do copies.
 *
 * Saves are checked on the instance against someone else's (a
 * `ConflictError` is kept in `conflict` for the view to ask about), and the
 * unsaved work is kept in the browser until it is saved.
 */
export function useBuilderPersistence({
    params,
    body,
    reset,
    replaceBody,
    toast,
}: {
    params: URLSearchParams
    /** The body in the undo history. */
    body: PresentationBody
    /** Starts the undo history over from a body: a presentation just opened. */
    reset: (body: PresentationBody) => void
    /** Puts a body in the editor as a change, to undo like any other: a version restored, a draft kept. */
    replaceBody: (body: PresentationBody) => void
    toast: (message: string, tone?: 'info' | 'critical') => void
}) {
    const session = useSession()
    const [record, setRecord] = useState<PresentationRecord | null>(null)
    const [meta, setMeta] = useState<Meta | null>(null)
    const [deck, setDeck] = useState<LoadedDeck | null>(null)
    const [saved, setSaved] = useState<Saved>(() => savedAs(null, EMPTY_BODY))
    const [opening, setOpening] = useState('Opening…')
    const [loadError, setLoadError] = useState('')
    const [deckError, setDeckError] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [conflict, setConflict] = useState<ConflictError | null>(null)

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
                const open = opened(found)
                nextMeta = open.meta
                nextBody = await openPictures(open.body, PRESENTATION_TABLE, found.sysId)
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
            reset(nextBody)
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

    /* ------------------------------- state ------------------------------- */

    const dirty = Boolean(meta) && (body !== saved.body || JSON.stringify(meta) !== saved.meta)
    const canChange = canChangePresentation(record, session)
    /** Never published: its first save publishes it. */
    const publishesOnSave = !record || record.version === 0
    /** Unpublished: changes saved as a draft, or not saved at all. */
    const unpublished = Boolean(record?.hasDraft) || dirty

    // Unsaved work on a saved presentation is kept in this browser until it is saved.
    const unsaved = useMemo<Unsaved | null>(() => (meta ? { meta, body } : null), [meta, body])
    const recordId = record?.sysId ?? ''
    const openKept = useCallback(
        async (kept: Unsaved | null) =>
            kept ? { ...kept, body: await openPictures(kept.body, PRESENTATION_TABLE, recordId) } : kept,
        [recordId]
    )
    const local = useLocalDraft<Unsaved | null>(
        record && canChange ? `presentation:${record.sysId}` : null,
        unsaved,
        dirty,
        record?.modCount ?? 0,
        openKept
    )
    const leftOver = Boolean(
        local.found?.value &&
            (JSON.stringify(local.found.value.meta) !== saved.meta ||
                JSON.stringify(local.found.value.body) !== JSON.stringify(saved.body))
    )
    useEffect(() => {
        if (local.found && !leftOver) local.dismiss()
    }, [local, leftOver])

    const restoreLocal = useCallback(() => {
        const kept = local.found?.value
        if (!kept) return
        setMeta(kept.meta)
        replaceBody(kept.body)
        local.dismiss()
    }, [local, replaceBody])

    /* ------------------------------- saving -------------------------------- */

    /** Saves the body in the editor, with the slides as they are arranged on screen. */
    const save = useCallback(
        async (slides: Slide[], mode: SaveMode = {}): Promise<boolean> => {
            if (!meta || saving) return false
            const asCopy = mode.asCopy === true
            const name = meta.name.trim() || meta.title.trim() || deck?.record.name || 'Untitled presentation'
            const updating = Boolean(record && !asCopy && canChange)
            // A copy, or a presentation never published, is published by its first save.
            const publish = mode.publish === true || !updating || publishesOnSave
            setSaving(true)
            setSaveError('')
            try {
                const settings = {
                    name: (asCopy ? `${name} (copy)` : name).slice(0, 100),
                    template: meta.templateId,
                    title: meta.title,
                    query: meta.query,
                    orderBy: meta.orderBy,
                    limit: meta.limit,
                }
                // Pictures are attachments of the presentation, so a new one is made first and given them after.
                const target = updating ? record! : await PresentationService.create({ ...settings, body: '' })
                // The order as the author saw it, record slides placed by the arrangement included.
                const ordered = readPresentation(serializePresentation({ ...body, order: orderOf(slides) }))
                const stored = await storePictures(ordered, PRESENTATION_TABLE, target.sysId)
                const text = JSON.stringify(stored)
                if (text.length > MAX_PRESENTATION_BODY_LENGTH) {
                    throw new Error(
                        `This presentation is too large to save (${Math.round(text.length / 1000).toLocaleString()} kB of ${
                            MAX_PRESENTATION_BODY_LENGTH / 1000
                        } kB). Remove some slides or elements.`
                    )
                }
                const input: Partial<PresentationInput> = publish
                    ? { ...settings, body: text, draftBody: '', publishNote: mode.note ?? '' }
                    : {
                          name: settings.name,
                          draftBody: JSON.stringify({
                              ...stored,
                              meta: {
                                  templateId: meta.templateId,
                                  title: meta.title,
                                  query: meta.query,
                                  orderBy: meta.orderBy,
                                  limit: meta.limit,
                              },
                          }),
                      }
                const expect = updating && !mode.force ? { expect: record!.modCount } : {}
                const written = await PresentationService.update(target.sysId, input, expect)
                const nextMeta = { ...meta, name: written.name }
                setRecord(written)
                setMeta(nextMeta)
                setSaved(savedAs(nextMeta, body))
                local.clear()
                replaceUrl('build', { id: written.sysId })
                setPageTitle(written.name)
                log.info('builder', `${publish ? 'Published' : 'Saved a draft of'} “${written.name}”`, {
                    sysId: written.sysId,
                    version: written.version,
                    bodyLength: text.length,
                })
                toast(
                    !updating
                        ? `Saved “${written.name}”.`
                        : publish
                          ? `Published version ${written.version}. Its link presents these changes now.`
                          : 'Draft saved. The link goes on presenting the published version until you publish.'
                )
                return true
            } catch (failure) {
                if (failure instanceof ConflictError) {
                    setConflict(failure)
                    return false
                }
                const { message, data } = describeError(failure)
                log.error('builder', `Save failed: ${message}`, data)
                setSaveError(failure instanceof Error ? failure.message : 'The presentation could not be saved.')
                return false
            } finally {
                setSaving(false)
            }
        },
        [meta, saving, deck, body, record, canChange, publishesOnSave, toast, local]
    )

    /** Throws the draft away: the editor goes back to what is published. */
    const discardDraft = useCallback(async () => {
        if (!record) return
        try {
            const written = await PresentationService.update(record.sysId, { draftBody: '' })
            const published = { ...sourceOf(written), name: written.name }
            const nextBody = await openPictures(readPresentation(written.body ?? ''), PRESENTATION_TABLE, written.sysId)
            setRecord(written)
            setMeta(published)
            reset(nextBody)
            setSaved(savedAs(published, nextBody))
            local.clear()
            if (published.templateId) await openDeck(published)
            else setDeck(null)
            toast('Unpublished changes discarded.')
        } catch (failure) {
            setSaveError(failure instanceof Error ? failure.message : 'The draft could not be discarded.')
        }
    }, [record, reset, local, openDeck, toast])

    /** A published version, put in the editor as a change: save or publish to keep it. */
    const restoreVersion = useCallback(
        async (version: PresentationVersion) => {
            if (!record || !meta) return
            const { body: text, meta: kept } = await PresentationService.version(version.sysId)
            const nextBody = await openPictures(readPresentation(text), PRESENTATION_TABLE, record.sysId)
            const nextMeta: Meta = {
                ...meta,
                templateId: kept.template ?? meta.templateId,
                title: kept.title ?? meta.title,
                query: kept.query ?? meta.query,
                orderBy: kept.order_by ?? meta.orderBy,
                limit: Number(kept.record_limit) || meta.limit,
            }
            const reload =
                nextMeta.templateId !== meta.templateId ||
                nextMeta.query !== meta.query ||
                nextMeta.orderBy !== meta.orderBy ||
                nextMeta.limit !== meta.limit
            setMeta(nextMeta)
            replaceBody(nextBody)
            if (reload && nextMeta.templateId) await openDeck(nextMeta)
            toast(`Version ${version.version} is in the builder. Save or publish to keep it.`, 'info')
        },
        [record, meta, replaceBody, openDeck, toast]
    )

    const remove = useCallback(async (): Promise<boolean> => {
        if (!record) return false
        try {
            await PresentationService.remove(record.sysId)
            setSaved(savedAs(meta, body))
            toast(`Deleted “${record.name}”.`)
            return true
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The presentation could not be deleted.', 'critical')
            return false
        }
    }, [record, meta, body, toast])

    /** Leaving on purpose: nothing unsaved is kept or asked about. */
    const forget = useCallback(() => {
        setSaved(savedAs(meta, body))
        local.clear()
    }, [meta, body, local])

    return {
        record,
        setRecord,
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
        save,
        discardDraft,
        restoreVersion,
        remove,
        forget,
        local,
        leftOver,
        restoreLocal,
    }
}
