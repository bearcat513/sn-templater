import React, { useEffect, useRef, useState } from 'react'
import { canChangePresentation, loadDeck, sourceOf } from '../data/deck'
import { loadRecords } from '../data/loader'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { readPresentation } from '../engine/presentation'
import { renderPdfDocument, renderPdfSlides, type RenderJob } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { documentFileName } from '../engine/tokens'
import { readTemplate } from '../engine/validate'
import { useAsync } from '../hooks/useAsync'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { SchemaService } from '../services/schema'
import { PresentationService, type PresentationRecord } from '../services/presentations'
import { TemplateService } from '../services/templates'
import { arrange, paginate, shown, type Slide } from '../slides/paginate'
import { Presenter } from '../slides/Presenter'
import { Icon } from '../ui/icons'
import { Button, Field, Input, Notice, Spinner, Switch } from '../ui/controls'
import { ConfirmModal, Menu, useToast } from '../ui/overlays'
import { SelectionForm, Step, TemplateChooser, type Selection } from './common'

type Deck = {
    template: PdfTemplate
    job: RenderJob
    title: string
    table: string
    matched: number
    /** A saved presentation's own running order; absent is the deck as the template draws it. */
    slides?: Slide[]
    presentation?: PresentationRecord
}

/**
 * Records as slides: pick a deck, pick the records, present.
 *
 * The presenter draws each slide in HTML from the same template the PDF
 * export uses, so "Export as PDF" from inside it hands over the same deck.
 *
 * Saved presentations — decks arranged in the slide builder, with custom
 * slides of their own — are listed first, to present or carry on building.
 * `?view=present&presentation=…` goes straight into presenting one.
 */
export function PresentView({ params, navigate }: { params: URLSearchParams; navigate: Navigate }) {
    const session = useSession()
    const toast = useToast()
    const [showAll, setShowAll] = useState(false)
    const templates = useAsync(() => TemplateService.list({ activeOnly: true }), [])
    const [templateId, setTemplateId] = useState(params.get('template') ?? '')
    const full = useAsync(() => TemplateService.get(templateId), [templateId], Boolean(templateId))
    const schema = useAsync(() => SchemaService.table(full.data!.table), [full.data], Boolean(full.data))

    const fromQuery = params.get('query')
    const [selection, setSelection] = useState<Selection>({
        mode: 'many',
        sysId: '',
        query: fromQuery ?? '',
        orderBy: params.get('order') ?? '',
        limit: Number(params.get('limit')) || 20,
    })
    const [title, setTitle] = useState('')

    const seeded = useRef('')
    useEffect(() => {
        if (!full.data || seeded.current === full.data.sysId) return
        seeded.current = full.data.sysId
        setTitle(full.data.name)
        if (fromQuery !== null) return
        setSelection(current => ({ ...current, query: full.data!.query, orderBy: full.data!.orderBy, limit: full.data!.limit }))
    }, [full.data, fromQuery])

    const [deck, setDeck] = useState<Deck | null>(null)
    useInspect('present.deck', deck)
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState('')
    const [error, setError] = useState('')
    const saved = useAsync(() => PresentationService.list(), [])
    const [opening, setOpening] = useState('')
    const [deleting, setDeleting] = useState<PresentationRecord | null>(null)

    /** Reads a saved presentation — its deck, its records, its arrangement — and starts presenting it. */
    const presentSaved = async (sysId: string) => {
        setOpening(sysId)
        setError('')
        try {
            const presentation = await PresentationService.get(sysId)
            if (!presentation.template) throw new Error(`“${presentation.name}” has no deck: its template was deleted. Open it in the builder to choose another.`)
            const loaded = await loadDeck(sourceOf(presentation), session)
            const slides = shown(arrange(paginate(loaded.template, loaded.job), loaded.job, readPresentation(presentation.body ?? '')))
            setDeck({
                template: loaded.template,
                job: loaded.job,
                title: presentation.name,
                table: loaded.schema.name,
                matched: loaded.matched,
                slides,
                presentation,
            })
            setPageTitle(presentation.name)
        } catch (failure) {
            const { message, data } = describeError(failure)
            log.error('present', message, data)
            setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
            setOpening('')
        }
    }

    const fromLink = params.get('presentation')
    useEffect(() => {
        if (fromLink) void presentSaved(fromLink)
        // Once, for the address the view was opened at.
    }, [fromLink])

    const removeSaved = async (presentation: PresentationRecord) => {
        setDeleting(null)
        try {
            await PresentationService.remove(presentation.sysId)
            toast(`Deleted “${presentation.name}”.`)
            saved.reload()
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The presentation could not be deleted.', 'critical')
        }
    }

    /** The slide builder, on the deck and records chosen below. */
    const build = () => {
        if (!full.data) return
        navigate('build', {
            template: full.data.sysId,
            title: title.trim() || full.data.name,
            query: selection.query,
            order: selection.orderBy,
            limit: String(selection.limit),
        })
    }

    const start = async () => {
        if (!full.data || !schema.data) return
        setBusy(true)
        setError('')
        setProgress('Reading records…')
        try {
            const read = readTemplate(full.data.body ?? '', full.data.kind, schema.data.fields)
            if (!read.ok) throw new Error(`“${full.data.name}” could not be read: ${read.error}`)
            const deckTitle = title.trim() || full.data.name
            const { job, matched } = await loadRecords({
                template: read.value,
                schema: schema.data,
                session,
                title: deckTitle,
                selection: { kind: 'query', query: selection.query, orderBy: selection.orderBy, limit: selection.limit },
                onProgress: (done, total) => total && setProgress(`Reading related lists… ${done} of ${total}`),
            })
            setDeck({ template: read.value, job, title: deckTitle, table: schema.data.name, matched })
            setPageTitle(deckTitle)
        } catch (failure) {
            const { message, data } = describeError(failure)
            log.error('present', message, data)
            setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
            setBusy(false)
            setProgress('')
        }
    }

    const exportPdf = () => {
        if (!deck) return
        try {
            const drawn = log.time('render', `Deck PDF drawn for “${deck.title}”`)
            const result = deck.slides
                ? renderPdfSlides(deck.template, deck.job, deck.slides)
                : renderPdfDocument(deck.template, deck.job)
            drawn({ pages: result.pageCount, bytes: result.bytes.length, problems: result.problems })
            downloadBytes(result.bytes, documentFileName(deck.title))
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The deck could not be exported.', 'critical')
        }
    }

    if (deck) {
        return (
            <Presenter
                template={deck.template}
                job={deck.job}
                title={deck.title}
                onExit={() => {
                    setDeck(null)
                    setPageTitle('Present')
                }}
                onExport={exportPdf}
                slides={deck.slides}
                onEdit={() =>
                    deck.presentation
                        ? navigate('build', { id: deck.presentation.sysId })
                        : navigate('build', {
                              template: templateId,
                              title: deck.title,
                              query: selection.query,
                              order: selection.orderBy,
                              limit: String(selection.limit),
                          })
                }
                editLabel={deck.presentation ? 'Edit in the slide builder' : 'Arrange and save in the slide builder'}
                recordUrl={owner => {
                    const sysId = deck.job.records[owner]?.values['raw.sys_id']
                    return sysId ? `/${deck.table}.do?sys_id=${encodeURIComponent(sysId)}` : null
                }}
            />
        )
    }

    const list = (templates.data ?? []).filter(template => showAll || template.kind === 'deck' || template.sysId === templateId)

    return (
        <div className="tp-page tp-page--narrow">
            <header className="tp-page__header">
                <div>
                    <h1>Present a deck</h1>
                    <p className="tp-muted">One slide per record. Arrow keys to move, F for full screen, G for an overview.</p>
                </div>
            </header>

            {saved.loading ? (
                <p className="tp-row tp-subtle">
                    <Spinner size={14} /> Loading saved presentations…
                </p>
            ) : saved.data?.length ? (
                <section className="tp-saved" aria-labelledby="saved-presentations">
                    <h2 id="saved-presentations" className="tp-saved__title">
                        Saved presentations
                    </h2>
                    <ul className="tp-saved__list">
                        {saved.data.map(presentation => (
                            <li key={presentation.sysId} className="tp-saved__item">
                                <span className="tp-choice__icon tp-kind--deck">
                                    <Icon name="slides" />
                                </span>
                                <span className="tp-saved__text">
                                    <span className="tp-saved__name tp-truncate">{presentation.name}</span>
                                    <span className="tp-subtle tp-truncate">
                                        {presentation.templateName || 'No deck'} · {presentation.updatedOn} · {presentation.createdBy}
                                    </span>
                                </span>
                                <Button
                                    size="sm"
                                    icon="play"
                                    busy={opening === presentation.sysId}
                                    disabled={Boolean(opening) || !presentation.template}
                                    onClick={() => void presentSaved(presentation.sysId)}
                                >
                                    Present
                                </Button>
                                <Button size="sm" variant="ghost" icon="layers" onClick={() => navigate('build', { id: presentation.sysId })}>
                                    Edit
                                </Button>
                                <Menu
                                    label={`Actions for ${presentation.name}`}
                                    items={[
                                        {
                                            label: 'Copy link to present',
                                            icon: 'copy',
                                            onSelect: () => {
                                                const link = `${window.location.origin}${window.location.pathname}?view=present&presentation=${presentation.sysId}`
                                                void navigator.clipboard?.writeText(link).then(() => toast('Link copied.', 'info'))
                                            },
                                        },
                                        ...(canChangePresentation(presentation, session)
                                            ? [
                                                  {
                                                      label: 'Delete',
                                                      icon: 'trash' as const,
                                                      danger: true,
                                                      onSelect: () => setDeleting(presentation),
                                                  },
                                              ]
                                            : []),
                                    ]}
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            <Notice kind="critical" lines={saved.error ? [saved.error] : []} />

            <Step number={1} title="Deck">
                {templates.loading ? (
                    <p className="tp-row tp-subtle">
                        <Spinner size={14} /> Loading templates…
                    </p>
                ) : (
                    <TemplateChooser
                        templates={list}
                        value={templateId}
                        onChange={template => setTemplateId(template.sysId)}
                        empty={
                            <>
                                No slide decks yet.{' '}
                                <button type="button" className="tp-link-btn" onClick={() => navigate('templates')}>
                                    Create one
                                </button>{' '}
                                or show PDF templates too.
                            </>
                        }
                    />
                )}
                <Switch checked={showAll} onChange={setShowAll} label="Show PDF templates too — any template can be presented" />
                <Notice kind="critical" lines={[templates.error, full.error].filter(Boolean)} />
            </Step>

            <Step number={2} title="Records">
                {schema.data ? (
                    <div className="tp-stack">
                        <Field label="Deck title" hint="Shown on the title slide as {{deck.title}}.">
                            <Input value={title} onChange={event => setTitle(event.target.value)} />
                        </Field>
                        <SelectionForm schema={schema.data} selection={selection} onChange={setSelection} allowOne={false} />
                    </div>
                ) : schema.loading || full.loading ? (
                    <p className="tp-row tp-subtle">
                        <Spinner size={14} /> Reading the table…
                    </p>
                ) : (
                    <p className="tp-subtle">Choose a deck first.</p>
                )}
                <Notice kind="critical" lines={schema.error ? [schema.error] : []} />
            </Step>

            <div className="tp-row">
                <Button variant="primary" icon="play" busy={busy} disabled={!schema.data} onClick={() => void start()}>
                    Start presenting
                </Button>
                <Button icon="layers" disabled={!schema.data} onClick={build}>
                    Build slides
                </Button>
                {progress && <span className="tp-subtle">{progress}</span>}
            </div>
            <p className="tp-subtle">
                Build slides opens the slide builder: put the slides in your own order, hide some, add slides of your own
                anywhere, and save it all as a presentation.
            </p>
            <Notice kind="critical" title={error ? 'The deck could not be loaded' : undefined} lines={error ? [error] : []} />
            <ConfirmModal
                open={deleting !== null}
                title="Delete this presentation?"
                message={`“${deleting?.name ?? ''}” and its custom slides will be deleted for everyone.`}
                confirmLabel="Delete presentation"
                danger
                onConfirm={() => deleting && void removeSaved(deleting)}
                onCancel={() => setDeleting(null)}
            />
        </div>
    )
}
