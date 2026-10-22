import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useCharts, withCharts } from '../data/charts'
import { loadRecords, specimenJob } from '../data/loader'
import { useSession } from '../data/session'
import { unknownTokens, type RenderJob } from '../engine/render'
import { chartTemplateIds, type PdfTemplate, type TemplateKind } from '../engine/template'
import { documentFileName } from '../engine/tokens'
import { dataSignature } from '../engine/vocabulary'
import { useDebounced } from '../hooks/useDebounced'
import { useElementSize } from '../hooks/useElementSize'
import { usePdf } from '../hooks/usePdf'
import type { TableSchema } from '../services/schema'
import { paginate } from '../slides/paginate'
import { SlideView } from '../slides/SlideView'
import { ProblemsPanel } from '../ui/ProblemsPanel'
import { Icon } from '../ui/icons'
import { Button, IconButton, Notice, Segmented, Spinner } from '../ui/controls'
import { RecordPicker } from './RecordPicker'

type Props = {
    template: PdfTemplate
    kind: TemplateKind
    schema: TableSchema
    title: string
    recordId: string
    onRecordChange: (sysId: string) => void
}

type Mode = 'pdf' | 'slides'

/**
 * The document, drawn as it changes.
 *
 * Against a real record when one is chosen — fetched again only when the
 * template starts needing a field or a list it did not before — and against a
 * specimen when none is, so nothing is ever designed blind. The PDF preview is
 * the production renderer's own bytes in an iframe; the slide preview is the
 * presenter's own renderer.
 */
export function Preview({ template, kind, schema, title, recordId, onRecordChange }: Props) {
    const session = useSession()
    const [mode, setMode] = useState<Mode>(kind === 'deck' ? 'slides' : 'pdf')
    const settled = useDebounced(template, 350)
    const signature = useMemo(() => dataSignature(settled), [settled])

    /* ------------------------------ the data ------------------------------ */

    const [loaded, setLoaded] = useState<{ key: string; job: RenderJob } | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [nonce, setNonce] = useState(0)
    const latestTemplate = useRef(settled)
    latestTemplate.current = settled

    const key = `${schema.name}|${recordId}|${signature}|${nonce}`

    useEffect(() => {
        if (!recordId) {
            setError('')
            return
        }
        let live = true
        setLoading(true)
        setError('')
        loadRecords({
            template: latestTemplate.current,
            schema,
            session,
            title,
            selection: { kind: 'ids', sysIds: [recordId] },
        })
            .then(result => live && setLoaded({ key, job: result.job }))
            .catch(failure => live && setError(failure instanceof Error ? failure.message : String(failure)))
            .finally(() => live && setLoading(false))
        return () => {
            live = false
        }
        // The key carries everything the fetch depends on.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])

    // Chart templates count their own tables, so the specimen shows them for real too.
    const charts = useCharts(useMemo(() => chartTemplateIds(settled), [settled]))
    const job = useMemo<RenderJob>(() => {
        if (recordId && loaded) {
            return withCharts(
                { ...loaded.job, title, coverValues: { ...loaded.job.coverValues, 'deck.title': title } },
                charts
            )
        }
        return withCharts(specimenJob(settled, schema, session, title), charts)
    }, [recordId, loaded, settled, schema, session, title, charts])

    /* ----------------------------- the render ----------------------------- */

    const pdf = usePdf(mode === 'pdf' ? settled : null, mode === 'pdf' ? job : null)
    const slides = useMemo(() => (mode === 'slides' ? paginate(settled, job) : []), [mode, settled, job])

    const stage = useRef<HTMLDivElement>(null)
    const { width } = useElementSize(stage)

    const unknown = useMemo(
        () => (mode === 'pdf' ? (pdf.result?.unknownTokens ?? []) : unknownTokens(settled, job)),
        [mode, pdf.result, settled, job]
    )

    const recordLabel = job.records[0]?.label ?? ''

    return (
        <section className="tp-preview" aria-label="Preview">
            <header className="tp-preview__header">
                <div className="tp-row tp-row--between">
                    <h3 className="tp-preview__title">
                        <Icon name="eye" /> Preview
                    </h3>
                    <Segmented<Mode>
                        label="Preview as"
                        size="sm"
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: 'pdf', label: 'PDF', icon: 'file' },
                            { value: 'slides', label: 'Slides', icon: 'slides' },
                        ]}
                    />
                </div>
                <div className="tp-row">
                    <div className="tp-grow">
                        <RecordPicker
                            schema={schema}
                            value={recordId}
                            onChange={sysId => onRecordChange(sysId)}
                            placeholder={`Preview with a ${schema.label} record…`}
                            aria-label="Preview record"
                        />
                    </div>
                    {recordId ? (
                        <>
                            <IconButton
                                icon="refresh"
                                label="Fetch the record again"
                                onClick={() => setNonce(value => value + 1)}
                            />
                            <Button size="sm" variant="ghost" onClick={() => onRecordChange('')}>
                                Specimen
                            </Button>
                        </>
                    ) : null}
                </div>
                <p className="tp-subtle tp-row">
                    {loading ? <Spinner size={12} /> : null}
                    {recordId
                        ? loading
                            ? 'Fetching the record…'
                            : `Drawn with ${recordLabel}`
                        : 'Drawn with a specimen — each field shows its own name.'}
                    {mode === 'pdf' && pdf.result
                        ? ` · ${pdf.result.pageCount} page${pdf.result.pageCount === 1 ? '' : 's'}`
                        : mode === 'slides'
                          ? ` · ${slides.length} slide${slides.length === 1 ? '' : 's'}`
                          : ''}
                </p>
            </header>

            <Notice kind="critical" lines={[error, pdf.error].filter(Boolean)} />
            <ProblemsPanel unknownTokens={unknown} problems={mode === 'pdf' ? (pdf.result?.problems ?? []) : []} />

            <div ref={stage} className="tp-preview__stage">
                {mode === 'pdf' ? (
                    pdf.url ? (
                        <iframe
                            className="tp-preview__frame"
                            src={`${pdf.url}#toolbar=0&navpanes=0&view=FitH`}
                            title="PDF preview"
                        />
                    ) : (
                        <div className="tp-preview__placeholder">
                            <Spinner /> Rendering…
                        </div>
                    )
                ) : (
                    <div className="tp-preview__slides">
                        {width > 0 &&
                            slides.map((slide, index) => (
                                <div key={index} className="tp-preview__slide">
                                    <span className="tp-subtle">
                                        {index + 1}. {slide.label}
                                    </span>
                                    <SlideView template={settled} slide={slide} width={Math.max(160, width - 24)} />
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {mode === 'pdf' && pdf.url && (
                <div className="tp-row tp-row--between">
                    <a className="tp-btn tp-btn--ghost tp-btn--sm" href={pdf.url} target="_blank" rel="noreferrer">
                        <Icon name="external" size={14} /> <span>Open in a tab</span>
                    </a>
                    <a
                        className="tp-btn tp-btn--secondary tp-btn--sm"
                        href={pdf.url}
                        download={documentFileName(`${title} ${recordId ? recordLabel : 'preview'}`)}
                    >
                        <Icon name="download" size={14} /> <span>Download</span>
                    </a>
                </div>
            )}
        </section>
    )
}
