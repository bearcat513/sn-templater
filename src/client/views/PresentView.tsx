import React, { useEffect, useRef, useState } from 'react'
import { loadRecords } from '../data/loader'
import { useSession } from '../data/session'
import { renderPdfDocument, type RenderJob } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { documentFileName } from '../engine/tokens'
import { readTemplate } from '../engine/validate'
import { useAsync } from '../hooks/useAsync'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { SchemaService } from '../services/schema'
import { TemplateService } from '../services/templates'
import { Presenter } from '../slides/Presenter'
import { Button, Field, Input, Notice, Spinner, Switch } from '../ui/controls'
import { useToast } from '../ui/overlays'
import { SelectionForm, Step, TemplateChooser, type Selection } from './common'

type Deck = { template: PdfTemplate; job: RenderJob; title: string; table: string; matched: number }

/**
 * Records as slides: pick a deck, pick the records, present.
 *
 * The presenter draws each slide in HTML from the same template the PDF
 * export uses, so "Export as PDF" from inside it hands over the same deck.
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
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState('')
    const [error, setError] = useState('')

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
            setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
            setBusy(false)
            setProgress('')
        }
    }

    const exportPdf = () => {
        if (!deck) return
        try {
            const result = renderPdfDocument(deck.template, deck.job)
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
                {progress && <span className="tp-subtle">{progress}</span>}
            </div>
            <Notice kind="critical" title={error ? 'The deck could not be loaded' : undefined} lines={error ? [error] : []} />
        </div>
    )
}
