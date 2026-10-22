import { openTemplate } from '../data/templates'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadRecords, type RecordSelection } from '../data/loader'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { renderPdfDocument, type PdfRenderResult, type RenderJob } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { documentFileName } from '../engine/tokens'
import { prepareFonts } from '../hooks/useFonts'
import { useAsync } from '../hooks/useAsync'
import { downloadBytes } from '../hooks/usePdf'
import type { Navigate } from '../hooks/useRoute'
import { AttachmentService } from '../services/attachments'
import { SchemaService, type TableSchema } from '../services/schema'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { Icon } from '../ui/icons'
import { Button, Notice, Spinner } from '../ui/controls'
import { ProblemsPanel } from '../ui/ProblemsPanel'
import { Progress } from '../ui/Progress'
import { EmailModal } from './EmailModal'
import { useToast } from '../ui/overlays'
import { SelectionForm, Step, TemplateChooser, type Selection } from './common'

type Output = {
    result: PdfRenderResult
    url: string
    job: RenderJob
    fileName: string
    matched: number
    /** The one record, when there was one — what "attach" attaches to. */
    single: { table: string; sysId: string } | null
}

/**
 * Records out as a PDF: pick a template, pick the records, get the file.
 *
 * Arriving from a record's "Export with Templater" link fills in the table and
 * the record; arriving from a list's selection fills in a sys_id filter. When
 * everything is already known, the document is made straight away.
 */
export function ExportView({ params, navigate }: { params: URLSearchParams; navigate: Navigate }) {
    const session = useSession()
    const toast = useToast()
    const fromTable = params.get('table') ?? ''
    const fromRecord = params.get('sys_id') ?? ''
    const fromQuery = params.get('query') ?? ''

    /* ----------------------------- templates ----------------------------- */

    // Arriving from a record, only templates for its table — or a table it
    // extends — are offered.
    const origin = useAsync(() => SchemaService.table(fromTable), [fromTable], Boolean(fromTable))
    const templates = useAsync(
        // A chart template draws no record, so it is not something to export one with.
        () =>
            TemplateService.list({ activeOnly: true, tables: origin.data?.ancestors }).then(list =>
                list.filter(template => template.kind !== 'chart')
            ),
        [origin.data],
        !fromTable || Boolean(origin.data)
    )

    const [templateId, setTemplateId] = useState(params.get('template') ?? '')
    const chosen = templates.data?.find(template => template.sysId === templateId)

    useEffect(() => {
        if (!templateId && templates.data?.length === 1) setTemplateId(templates.data[0]!.sysId)
    }, [templates.data, templateId])

    const full = useAsync(() => TemplateService.get(templateId), [templateId], Boolean(templateId))
    const schema = useAsync(
        () => SchemaService.table(fromTable || full.data!.table),
        [fromTable, full.data],
        Boolean(fromTable || full.data)
    )

    /* ------------------------------ records ------------------------------ */

    const [selection, setSelection] = useState<Selection>({
        mode: fromQuery ? 'many' : 'one',
        sysId: fromRecord,
        query: fromQuery,
        orderBy: '',
        limit: 50,
    })

    // A template's own default filter fills in a batch — unless the page was
    // opened with records already chosen.
    const seeded = useRef('')
    useEffect(() => {
        if (!full.data || seeded.current === full.data.sysId) return
        seeded.current = full.data.sysId
        if (fromQuery || fromRecord) return
        setSelection(current => ({
            ...current,
            query: full.data!.query,
            orderBy: full.data!.orderBy,
            limit: full.data!.limit,
        }))
    }, [full.data, fromQuery, fromRecord])

    /* ------------------------------ making ------------------------------- */

    const [output, setOutput] = useState<Output | null>(null)
    useInspect('export.template', full.data)
    useInspect('export.job', output?.job)
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<{ label: string; done?: number; total?: number } | null>(null)
    const cancel = useRef<AbortController | null>(null)
    const [emailing, setEmailing] = useState(false)
    const [error, setError] = useState('')
    const urlRef = useRef('')

    useEffect(
        () => () => {
            if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        },
        []
    )

    const ready = Boolean(full.data && schema.data && (selection.mode === 'many' || selection.sysId))

    const make = async (record: TemplateRecord, tableSchema: TableSchema, current: Selection) => {
        const controller = new AbortController()
        cancel.current = controller
        const stopIfCancelled = () => {
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        }
        setBusy(true)
        setError('')
        setProgress({ label: 'Reading records' })
        try {
            const read = await openTemplate(record, tableSchema.fields)
            if (!read.ok) throw new Error(`“${record.name}” could not be read: ${read.error}`)
            const template: PdfTemplate = read.value
            const pick: RecordSelection =
                current.mode === 'one'
                    ? { kind: 'ids', sysIds: [current.sysId] }
                    : { kind: 'query', query: current.query, orderBy: current.orderBy, limit: current.limit }

            const { job, matched } = await loadRecords({
                template,
                schema: tableSchema,
                session,
                title: record.name,
                selection: pick,
                signal: controller.signal,
                onProgress: (done, total) => total && setProgress({ label: 'Reading related lists', done, total }),
            })
            stopIfCancelled()
            setProgress({ label: 'Getting the fonts ready' })
            await prepareFonts(template, job)
            stopIfCancelled()
            setProgress({ label: `Drawing ${job.records.length} record${job.records.length === 1 ? '' : 's'}` })
            // Let the progress line paint before the synchronous render.
            await new Promise(resolve => window.setTimeout(resolve, 16))
            const drawn = log.time('render', `Export PDF drawn for “${record.name}”`)
            const result = renderPdfDocument(template, job)
            drawn({
                pages: result.pageCount,
                bytes: result.bytes.length,
                records: job.records.length,
                unknownTokens: result.unknownTokens,
                problems: result.problems,
            })

            if (urlRef.current) URL.revokeObjectURL(urlRef.current)
            const url = URL.createObjectURL(
                new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' })
            )
            urlRef.current = url

            const single = job.records.length === 1 && current.mode === 'one' ? job.records[0]! : null
            setOutput({
                result,
                url,
                job,
                matched,
                fileName: documentFileName(single ? `${record.name} ${single.label}` : record.name),
                single: single ? { table: tableSchema.name, sysId: current.sysId } : null,
            })
        } catch (failure) {
            if (failure instanceof DOMException && failure.name === 'AbortError') {
                toast('Export cancelled.', 'info')
                return
            }
            const { message, data } = describeError(failure)
            log.error('export', message, data)
            setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
            cancel.current = null
            setBusy(false)
            setProgress(null)
        }
    }

    // Everything known on arrival — a template and a record — means go.
    const autoRan = useRef(false)
    useEffect(() => {
        if (autoRan.current || !ready || !full.data || !schema.data) return
        const templateKnown = Boolean(params.get('template')) || templates.data?.length === 1
        if (!(fromRecord || fromQuery) || !templateKnown) return
        autoRan.current = true
        void make(full.data, schema.data, selection)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, full.data, schema.data])

    const [attaching, setAttaching] = useState(false)
    /** The PDF's attachment on its record, once attached — so attaching twice does not make two. */
    const attached = useRef<{ url: string; sysId: string } | null>(null)

    const attachOnce = async (): Promise<string> => {
        if (!output?.single) throw new Error('Only a PDF of one record can be attached to it.')
        if (attached.current?.url === output.url) return attached.current.sysId
        const file = await AttachmentService.upload(
            output.single.table,
            output.single.sysId,
            output.fileName,
            output.result.bytes,
            'application/pdf'
        )
        attached.current = { url: output.url, sysId: file.sysId }
        return file.sysId
    }

    const attach = async () => {
        if (!output?.single) return
        setAttaching(true)
        try {
            const already = attached.current?.url === output.url
            await attachOnce()
            toast(
                already
                    ? `${output.fileName} is already attached.`
                    : `Attached ${output.fileName} to ${output.job.records[0]?.label ?? 'the record'}.`
            )
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'The PDF could not be attached.', 'critical')
        } finally {
            setAttaching(false)
        }
    }

    const templateList = templates.data ?? []
    const emptyTemplates = useMemo(
        () =>
            fromTable
                ? `No active template fits ${origin.data?.label ?? fromTable} yet.`
                : 'No active templates yet. Create one on the Templates page.',
        [fromTable, origin.data]
    )

    return (
        <div className="tp-page tp-export">
            <header className="tp-page__header">
                <div>
                    <h1>Export to PDF</h1>
                    <p className="tp-muted">
                        One record with its related lists, or a batch — each record starting on a fresh page of the same
                        file.
                    </p>
                </div>
            </header>

            <div className="tp-export__grid">
                <div className="tp-stack">
                    <Step number={1} title="Template">
                        {templates.loading || origin.loading ? (
                            <p className="tp-row tp-subtle">
                                <Spinner size={14} /> Loading templates…
                            </p>
                        ) : (
                            <TemplateChooser
                                templates={templateList}
                                value={templateId}
                                onChange={template => {
                                    setTemplateId(template.sysId)
                                    setOutput(null)
                                }}
                                empty={emptyTemplates}
                            />
                        )}
                        <Notice kind="critical" lines={[templates.error, origin.error, full.error].filter(Boolean)} />
                    </Step>

                    <Step number={2} title="Records">
                        {schema.data ? (
                            <SelectionForm schema={schema.data} selection={selection} onChange={setSelection} />
                        ) : schema.loading || full.loading ? (
                            <p className="tp-row tp-subtle">
                                <Spinner size={14} /> Reading the table…
                            </p>
                        ) : (
                            <p className="tp-subtle">Choose a template first.</p>
                        )}
                        <Notice kind="critical" lines={schema.error ? [schema.error] : []} />
                    </Step>

                    <div className="tp-row">
                        <Button
                            variant="primary"
                            icon="file"
                            busy={busy}
                            disabled={!ready}
                            onClick={() => full.data && schema.data && void make(full.data, schema.data, selection)}
                        >
                            Make the PDF
                        </Button>
                        {chosen?.kind === 'deck' && (
                            <Button
                                icon="play"
                                disabled={!ready}
                                onClick={() =>
                                    navigate('present', {
                                        template: templateId,
                                        query: selection.mode === 'one' ? `sys_id=${selection.sysId}` : selection.query,
                                        order: selection.mode === 'one' ? undefined : selection.orderBy,
                                        limit: selection.mode === 'one' ? undefined : String(selection.limit),
                                    })
                                }
                            >
                                Present instead
                            </Button>
                        )}
                    </div>
                    {progress && (
                        <Progress
                            label={progress.label}
                            done={progress.done}
                            total={progress.total}
                            onCancel={() => cancel.current?.abort()}
                        />
                    )}
                    <Notice
                        kind="critical"
                        title={error ? 'The PDF could not be made' : undefined}
                        lines={error ? [error] : []}
                    />
                </div>

                <div className="tp-export__result">
                    {output ? (
                        <div className="tp-stack">
                            <div className="tp-row tp-row--between tp-row--wrap">
                                <div>
                                    <h2 className="tp-card__title">{output.fileName}</h2>
                                    <p className="tp-subtle">
                                        {output.job.records.length} record{output.job.records.length === 1 ? '' : 's'} ·{' '}
                                        {output.result.pageCount} page{output.result.pageCount === 1 ? '' : 's'} ·{' '}
                                        {(output.result.bytes.length / 1024).toFixed(0)} kB
                                        {output.matched > output.job.records.length
                                            ? ` · ${output.matched.toLocaleString()} matched, the first ${output.job.records.length} included`
                                            : ''}
                                    </p>
                                </div>
                                <div className="tp-row">
                                    {output.single && (
                                        <Button icon="paperclip" busy={attaching} onClick={() => void attach()}>
                                            Attach to record
                                        </Button>
                                    )}
                                    {output.single && (
                                        <Button icon="mail" onClick={() => setEmailing(true)}>
                                            Email…
                                        </Button>
                                    )}
                                    <Button
                                        variant="primary"
                                        icon="download"
                                        onClick={() => downloadBytes(output.result.bytes, output.fileName)}
                                    >
                                        Download
                                    </Button>
                                </div>
                            </div>
                            <ProblemsPanel
                                unknownTokens={output.result.unknownTokens}
                                problems={output.result.problems}
                                notes={
                                    output.matched > output.job.records.length
                                        ? [
                                              `${(output.matched - output.job.records.length).toLocaleString()} matching records were left out: one PDF holds at most ${output.job.records.length}.`,
                                          ]
                                        : []
                                }
                            />
                            <iframe className="tp-export__frame" src={`${output.url}#view=FitH`} title="Exported PDF" />
                        </div>
                    ) : (
                        <div className="tp-export__placeholder">
                            {busy ? (
                                <>
                                    <Spinner size={28} />
                                    <p>{progress?.label ?? 'Working'}…</p>
                                </>
                            ) : (
                                <>
                                    <Icon name="file" size={36} />
                                    <p>The PDF appears here.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {output?.single && (
                <EmailModal
                    open={emailing}
                    fileName={output.fileName}
                    recordLabel={output.job.records[0]?.label ?? 'the record'}
                    table={output.single.table}
                    sysId={output.single.sysId}
                    attach={attachOnce}
                    onClose={() => setEmailing(false)}
                />
            )}
        </div>
    )
}
