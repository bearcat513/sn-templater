import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Designer } from '../designer/Designer'
import { ChartEditorView } from './ChartEditorView'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { TEMPLATE_KIND_LABELS, type PdfTemplate, type TemplateKind } from '../engine/template'
import { readTemplate, serializeTemplate } from '../engine/validate'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { SchemaService, type TableSchema } from '../services/schema'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { Icon } from '../ui/icons'
import { Badge, Button, Field, Input, Notice, NumberInput, Segmented, Spinner, Switch, Textarea } from '../ui/controls'
import { ConfirmModal, Menu, useToast } from '../ui/overlays'
import { TablePicker } from './common'

type Meta = {
    name: string
    description: string
    active: boolean
    table: string
    tableLabel: string
    query: string
    orderBy: string
    limit: number
}

type Loaded = { record: TemplateRecord; schema: TableSchema; template: PdfTemplate; meta: Meta }

const metaOf = (record: TemplateRecord): Meta => ({
    name: record.name,
    description: record.description,
    active: record.active,
    table: record.table,
    tableLabel: record.tableLabel,
    query: record.query,
    orderBy: record.orderBy,
    limit: record.limit,
})

/** What is compared to decide whether there is anything to save. */
const snapshot = (meta: Meta, template: PdfTemplate) =>
    JSON.stringify([meta.name, meta.description, meta.active, meta.table, meta.query, meta.orderBy, meta.limit, template])

type Tab = 'design' | 'settings'

export function EditorView({ id, navigate }: { id: string; navigate: Navigate }) {
    const session = useSession()
    const toast = useToast()
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [loadError, setLoadError] = useState('')
    const [meta, setMeta] = useState<Meta | null>(null)
    const [template, setTemplate] = useState<PdfTemplate | null>(null)
    const [saved, setSaved] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [parseNote, setParseNote] = useState('')
    const [tab, setTab] = useState<Tab>('design')
    const [previewRecord, setPreviewRecord] = useState('')
    const [pending, setPending] = useState<(() => void) | null>(null)
    // A chart template is not a document: it has its own designer.
    const [chartOpened, setChartOpened] = useState<{ record: TemplateRecord; schema: TableSchema } | null>(null)

    /* ------------------------------- loading ------------------------------- */

    useEffect(() => {
        let live = true
        setLoaded(null)
        setLoadError('')
        setChartOpened(null)
        ;(async () => {
            const record = await TemplateService.get(id)
            const schema = await SchemaService.table(record.table)
            if (record.kind === 'chart') {
                if (live) setChartOpened({ record, schema })
                return
            }
            // Read through the validator, so a body written by hand opens with
            // exactly the defaults it will be stored with — and an unreadable
            // one opens as the starter rather than a blank screen.
            const read = readTemplate(record.body ?? '', record.kind, schema.fields)
            const starter = readTemplate('', record.kind, schema.fields)
            const body = read.ok ? read.value : starter.ok ? starter.value : null
            if (!live || !body) return
            log.info('editor', `Opened “${record.name}”`, { sysId: record.sysId, table: record.table, kind: record.kind })
            if (!read.ok) log.warn('editor', `Stored body unreadable: ${read.error}`, record.body)
            if (!read.ok) setParseNote(`The stored body could not be read (${read.error}) — opened the starter template instead.`)
            const nextMeta = metaOf(record)
            setLoaded({ record, schema, template: body, meta: nextMeta })
            setMeta(nextMeta)
            setTemplate(body)
            setSaved(snapshot(nextMeta, body))
            setPageTitle(record.name)
        })().catch(failure => live && setLoadError(failure instanceof Error ? failure.message : String(failure)))
        return () => {
            live = false
        }
    }, [id])

    const dirty = Boolean(meta && template && snapshot(meta, template) !== saved)
    const canEdit = session.canEdit

    useInspect('editor.record', loaded?.record)
    useInspect('editor.schema', loaded?.schema)
    useInspect('editor.meta', meta)
    useInspect('editor.template', template)
    useInspect('editor.dirty', dirty)

    /* ------------------------------- leaving ------------------------------- */

    useEffect(() => {
        if (!dirty) return
        const onUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', onUnload)
        return () => window.removeEventListener('beforeunload', onUnload)
    }, [dirty])

    const guarded = useCallback(
        (go: () => void) => {
            if (dirty) setPending(() => go)
            else go()
        },
        [dirty]
    )

    /* ------------------------------- saving -------------------------------- */

    const save = useCallback(async () => {
        if (!loaded || !meta || !template || !canEdit) return
        if (!meta.name.trim()) {
            setSaveError('A template needs a name.')
            return
        }
        setSaving(true)
        setSaveError('')
        try {
            const body = serializeTemplate(template)
            const record = await TemplateService.update(loaded.record.sysId, {
                name: meta.name.trim(),
                description: meta.description,
                active: meta.active,
                table: meta.table,
                query: meta.query,
                orderBy: meta.orderBy,
                limit: meta.limit,
                body,
            })
            const nextMeta = { ...meta, tableLabel: record.tableLabel || meta.tableLabel }
            setMeta(nextMeta)
            setSaved(snapshot(nextMeta, template))
            setLoaded({ ...loaded, record, meta: nextMeta, template })
            setPageTitle(record.name)
            log.info('editor', `Saved “${record.name}”`, { sysId: record.sysId, bodyLength: body.length })
            toast('Template saved.')
        } catch (failure) {
            const { message, data } = describeError(failure)
            log.error('editor', `Save failed: ${message}`, data)
            setSaveError(failure instanceof Error ? failure.message : 'The template could not be saved.')
        } finally {
            setSaving(false)
        }
    }, [loaded, meta, template, canEdit, toast])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void save()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [save])

    /* ---------------------------- changing table --------------------------- */

    const changeTable = async (table: string, label: string) => {
        if (!meta || !loaded) return
        try {
            const schema = await SchemaService.table(table)
            setLoaded({ ...loaded, schema })
            setMeta({ ...meta, table: schema.name, tableLabel: label || schema.label })
            setPreviewRecord('')
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'That table could not be read.', 'critical')
        }
    }

    const kind: TemplateKind = loaded?.record.kind ?? 'document'
    const title = meta?.name || 'Untitled'
    const jsonBody = useMemo(() => (template ? JSON.stringify(template, null, 2) : ''), [template])

    if (chartOpened) {
        return <ChartEditorView key={chartOpened.record.sysId} record={chartOpened.record} schema={chartOpened.schema} navigate={navigate} />
    }

    if (loadError) {
        return (
            <div className="tp-page">
                <Notice kind="critical" title="This template could not be opened" lines={[loadError]} />
                <div>
                    <Button icon="arrowLeft" onClick={() => navigate('templates')}>
                        Back to templates
                    </Button>
                </div>
            </div>
        )
    }

    if (!loaded || !meta || !template) {
        return (
            <div className="tp-loading">
                <Spinner /> Opening the template…
            </div>
        )
    }

    return (
        <div className="tp-editor">
            <header className="tp-editor__bar">
                <Button variant="ghost" icon="arrowLeft" onClick={() => guarded(() => navigate('templates'))}>
                    Templates
                </Button>
                <div className="tp-editor__identity">
                    <Input
                        className="tp-editor__name"
                        value={meta.name}
                        maxLength={100}
                        readOnly={!canEdit}
                        onChange={event => setMeta({ ...meta, name: event.target.value })}
                        aria-label="Template name"
                    />
                    <Badge tone={kind === 'deck' ? 'primary' : 'neutral'}>{TEMPLATE_KIND_LABELS[kind]}</Badge>
                    <span className="tp-subtle tp-truncate">
                        {meta.tableLabel || meta.table} <code>{meta.table}</code>
                    </span>
                    {dirty && <Badge tone="warning">Unsaved</Badge>}
                </div>
                <div className="tp-row">
                    <Segmented<Tab>
                        label="Section"
                        size="sm"
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'design', label: 'Design', icon: 'layers' },
                            { value: 'settings', label: 'Settings', icon: 'settings' },
                        ]}
                    />
                    {kind === 'deck' && (
                        <Button
                            icon="play"
                            onClick={() => guarded(() => navigate('present', { template: loaded.record.sysId }))}
                        >
                            Present
                        </Button>
                    )}
                    <Button icon="download" onClick={() => guarded(() => navigate('export', { template: loaded.record.sysId }))}>
                        Export
                    </Button>
                    {canEdit && (
                        <Button variant="primary" icon="save" busy={saving} disabled={!dirty} onClick={() => void save()}>
                            Save
                        </Button>
                    )}
                </div>
            </header>

            <div className="tp-editor__notices">
                {!canEdit && (
                    <Notice kind="info" lines={['You can look at this template and export with it, but only Templater editors can change it.']} />
                )}
                <Notice kind="critical" lines={saveError ? [saveError] : []} onDismiss={saveError ? () => setSaveError('') : undefined} />
                <Notice kind="warning" lines={parseNote ? [parseNote] : []} onDismiss={parseNote ? () => setParseNote('') : undefined} />
            </div>

            {tab === 'design' ? (
                <Designer
                    template={template}
                    onChange={setTemplate}
                    kind={kind}
                    schema={loaded.schema}
                    title={title}
                    previewRecord={previewRecord}
                    onPreviewRecordChange={setPreviewRecord}
                />
            ) : (
                <div className="tp-page tp-page--narrow">
                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">About this template</h2>
                            <Field label="Description">
                                <Textarea
                                    rows={3}
                                    value={meta.description}
                                    readOnly={!canEdit}
                                    onChange={event => setMeta({ ...meta, description: event.target.value })}
                                />
                            </Field>
                            <Switch
                                checked={meta.active}
                                disabled={!canEdit}
                                onChange={active => setMeta({ ...meta, active })}
                                label="Active — offered on records and in the export and present screens"
                            />
                            <Field
                                label="Table"
                                hint="Changing it keeps the blocks; tokens naming fields the new table lacks will print blank, and the preview will say which."
                            >
                                <TablePicker value={meta.table} label={meta.tableLabel} onChange={(table, label) => void changeTable(table, label)} />
                            </Field>
                        </div>
                    </section>

                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">Default records</h2>
                            <p className="tp-muted">
                                Where a {kind === 'deck' ? 'deck' : 'batch export'} starts. People can change it when they{' '}
                                {kind === 'deck' ? 'present' : 'export'}.
                            </p>
                            <Field
                                label="Filter"
                                hint={
                                    <>
                                        An encoded query. Build one in the{' '}
                                        <a href={`/${meta.table}_list.do`} target="_blank" rel="noreferrer">
                                            {meta.tableLabel || meta.table} list
                                        </a>{' '}
                                        and use “Copy query”.
                                    </>
                                }
                            >
                                <Textarea
                                    className="tp-mono"
                                    rows={2}
                                    value={meta.query}
                                    readOnly={!canEdit}
                                    spellCheck={false}
                                    onChange={event => setMeta({ ...meta, query: event.target.value })}
                                    placeholder="active=true"
                                />
                            </Field>
                            <div className="tp-grid tp-grid--2">
                                <Field label="Order by" hint="A field; start with - for newest first.">
                                    <Input
                                        className="tp-mono"
                                        value={meta.orderBy}
                                        readOnly={!canEdit}
                                        onChange={event => setMeta({ ...meta, orderBy: event.target.value.trim() })}
                                        placeholder="-sys_updated_on"
                                    />
                                </Field>
                                <Field label="At most">
                                    <NumberInput
                                        min={1}
                                        max={500}
                                        value={meta.limit}
                                        onChange={limit => setMeta({ ...meta, limit: limit ?? 50 })}
                                        aria-label="Record limit"
                                    />
                                </Field>
                            </div>
                        </div>
                    </section>

                    <JsonCard
                        json={jsonBody}
                        canEdit={canEdit}
                        fileName={`${meta.name || 'template'}.json`}
                        onApply={text => {
                            const read = readTemplate(text, kind, loaded.schema.fields)
                            if (!read.ok) return read.error
                            setTemplate(read.value)
                            toast('Template body replaced. Save to keep it.', 'info')
                            return ''
                        }}
                    />
                </div>
            )}

            <ConfirmModal
                open={pending !== null}
                title="Leave without saving?"
                message="Your changes to this template have not been saved."
                confirmLabel="Discard changes"
                danger
                onConfirm={() => {
                    const go = pending
                    setPending(null)
                    setSaved(meta && template ? snapshot(meta, template) : saved)
                    go?.()
                }}
                onCancel={() => setPending(null)}
            />
        </div>
    )
}

/** The template as JSON: to read, to copy to another instance, or to paste one in. */
function JsonCard({
    json,
    canEdit,
    fileName,
    onApply,
}: {
    json: string
    canEdit: boolean
    fileName: string
    onApply: (text: string) => string
}) {
    const [draft, setDraft] = useState<string | null>(null)
    const [error, setError] = useState('')
    const toast = useToast()

    return (
        <section className="tp-card">
            <div className="tp-card__body tp-stack">
                <div className="tp-row tp-row--between">
                    <h2 className="tp-card__title">
                        <Icon name="code" /> Template body
                    </h2>
                    <Menu
                        label="Body actions"
                        items={[
                            {
                                label: 'Copy JSON',
                                icon: 'copy',
                                onSelect: () =>
                                    void navigator.clipboard?.writeText(json).then(() => toast('Copied the template body.', 'info')),
                            },
                            {
                                label: 'Download JSON',
                                icon: 'download',
                                onSelect: () => downloadBytes(new TextEncoder().encode(json), fileName, 'application/json'),
                            },
                        ]}
                    />
                </div>
                <p className="tp-muted">
                    The document described as data — page, style, blocks — with any logos inside it as images. Paste a body
                    from another instance here to copy a template across.
                </p>
                <Textarea
                    className="tp-mono tp-json"
                    rows={16}
                    value={draft ?? json}
                    readOnly={!canEdit}
                    spellCheck={false}
                    onChange={event => setDraft(event.target.value)}
                    aria-label="Template body JSON"
                />
                <Notice kind="critical" lines={error ? [error] : []} />
                {canEdit && draft !== null && (
                    <div className="tp-row">
                        <Button
                            variant="primary"
                            onClick={() => {
                                const problem = onApply(draft)
                                setError(problem)
                                if (!problem) setDraft(null)
                            }}
                        >
                            Apply
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setDraft(null)
                                setError('')
                            }}
                        >
                            Revert
                        </Button>
                    </div>
                )}
            </div>
        </section>
    )
}
