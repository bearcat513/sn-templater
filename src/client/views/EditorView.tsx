import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Designer } from '../designer/Designer'
import { HistoryPanel } from '../designer/HistoryPanel'
import { PublishModal } from '../designer/PublishModal'
import { ChartEditorView } from './ChartEditorView'
import { openPictures, storePictures } from '../data/pictures'
import { useSession } from '../data/session'
import { openTemplate } from '../data/templates'
import { describeError, log, useInspect } from '../debug/log'
import { TEMPLATE_KIND_LABELS, type PdfTemplate, type TemplateKind } from '../engine/template'
import { readTemplate, serializeTemplate } from '../engine/validate'
import { useLocalDraft } from '../hooks/useLocalDraft'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { ConflictError } from '../services/http'
import { SchemaService, type TableSchema } from '../services/schema'
import { TEMPLATE_TABLE, TemplateService, type TemplateRecord } from '../services/templates'
import { ConflictModal } from '../ui/ConflictModal'
import { Icon } from '../ui/icons'
import { Badge, Button, Field, Input, Notice, NumberInput, Segmented, Spinner, Switch, Textarea } from '../ui/controls'
import { ConfirmModal, Menu, useToast } from '../ui/overlays'
import { NarrowNotice } from '../ui/NarrowNotice'
import { TablePicker, droppedNote } from './common'

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
    JSON.stringify([
        meta.name,
        meta.description,
        meta.active,
        meta.table,
        meta.query,
        meta.orderBy,
        meta.limit,
        template,
    ])

/** What is kept in this browser while there are unsaved changes. */
type Unsaved = { meta: Meta; template: PdfTemplate }

type Tab = 'design' | 'settings' | 'history'

/**
 * How a save goes. A draft keeps the published template as it is; a publish
 * replaces it and becomes a new version. `force` saves even over someone
 * else's changes.
 */
type SaveMode = { publish: boolean; note?: string; force?: boolean }

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
    const [conflict, setConflict] = useState<ConflictError | null>(null)
    const [publishing, setPublishing] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [reloads, setReloads] = useState(0)
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
            // one opens as the starter rather than a blank screen. The designer
            // opens the unpublished draft when there is one.
            const read = await openTemplate(record, schema.fields, 'draft')
            const starter = readTemplate('', record.kind, schema.fields)
            const body = read.ok ? read.value : starter.ok ? starter.value : null
            if (!live || !body) return
            log.info('editor', `Opened “${record.name}”`, {
                sysId: record.sysId,
                table: record.table,
                kind: record.kind,
                version: record.version,
                hasDraft: record.hasDraft,
            })
            if (!read.ok) log.warn('editor', `Stored body unreadable: ${read.error}`, record.body)
            if (!read.ok)
                setParseNote(`The stored body could not be read (${read.error}) — opened the starter template instead.`)
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
    }, [id, reloads])

    const dirty = Boolean(meta && template && snapshot(meta, template) !== saved)
    const canEdit = session.canEdit
    const record = loaded?.record
    /** Unpublished: saved as a draft, or not saved at all. */
    const unpublished = Boolean(record?.hasDraft) || dirty
    /** A template nobody has published since it was made publishes on its first save. */
    const publishesOnSave = Boolean(record && record.version <= 1 && !record.hasDraft)

    const unsaved = useMemo<Unsaved | null>(() => (meta && template ? { meta, template } : null), [meta, template])
    const recordId = record?.sysId ?? ''
    // The copy names the template's saved pictures; they are opened again before it is offered.
    const openKept = useCallback(
        async (kept: Unsaved | null) =>
            kept ? { ...kept, template: await openPictures(kept.template, TEMPLATE_TABLE, recordId) } : kept,
        [recordId]
    )
    const local = useLocalDraft<Unsaved | null>(
        canEdit && record ? `template:${record.sysId}` : null,
        unsaved,
        dirty,
        record?.modCount ?? 0,
        openKept
    )
    const leftOver = local.found?.value && snapshot(local.found.value.meta, local.found.value.template) !== saved
    // A kept copy that matches what is saved is nothing to offer: forget it, and keep the next one.
    useEffect(() => {
        if (local.found && saved && !leftOver) local.dismiss()
    }, [local, saved, leftOver])

    useInspect('editor.record', record)
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

    const save = useCallback(
        async (mode: SaveMode) => {
            if (!loaded || !meta || !template || !canEdit || saving) return
            if (!meta.name.trim()) {
                setSaveError('A template needs a name.')
                return
            }
            setSaving(true)
            setSaveError('')
            try {
                const sysId = loaded.record.sysId
                // Pictures go to the template's attachments; the body names them.
                const stored = await storePictures(
                    JSON.parse(serializeTemplate(template)) as PdfTemplate,
                    TEMPLATE_TABLE,
                    sysId
                )
                const body = JSON.stringify(stored)
                const updated = await TemplateService.update(
                    sysId,
                    {
                        name: meta.name.trim(),
                        description: meta.description,
                        active: meta.active,
                        table: meta.table,
                        query: meta.query,
                        orderBy: meta.orderBy,
                        limit: meta.limit,
                        ...(mode.publish ? { body, draftBody: '', publishNote: mode.note ?? '' } : { draftBody: body }),
                    },
                    mode.force ? {} : { expect: loaded.record.modCount }
                )
                const nextMeta = { ...meta, tableLabel: updated.tableLabel || meta.tableLabel }
                setMeta(nextMeta)
                setSaved(snapshot(nextMeta, template))
                setLoaded({ ...loaded, record: updated, meta: nextMeta, template })
                setPageTitle(updated.name)
                local.clear()
                log.info('editor', `${mode.publish ? 'Published' : 'Saved a draft of'} “${updated.name}”`, {
                    sysId,
                    version: updated.version,
                    bodyLength: body.length,
                })
                toast(
                    mode.publish
                        ? `Published version ${updated.version}.`
                        : 'Draft saved. Exports keep using the published version until you publish.'
                )
            } catch (failure) {
                if (failure instanceof ConflictError) {
                    setConflict(failure)
                    return
                }
                const { message, data } = describeError(failure)
                log.error('editor', `Save failed: ${message}`, data)
                setSaveError(failure instanceof Error ? failure.message : 'The template could not be saved.')
            } finally {
                setSaving(false)
            }
        },
        [loaded, meta, template, canEdit, saving, toast, local]
    )

    /** The Save button and Ctrl+S: a draft, except for a template nobody has published yet. */
    const saveDraft = useCallback(() => save({ publish: publishesOnSave }), [save, publishesOnSave])

    /** Keeps both: the editor's version as a new template, leaving the other person's where it is. */
    const saveCopy = async () => {
        if (!loaded || !meta || !template) return
        setConflict(null)
        try {
            const copy = await TemplateService.create({
                name: `${meta.name.trim() || 'Untitled'} (copy)`.slice(0, 100),
                kind: loaded.record.kind,
                table: meta.table,
                description: meta.description,
                active: meta.active,
                query: meta.query,
                orderBy: meta.orderBy,
                limit: meta.limit,
                body: '',
            })
            const stored = await storePictures(JSON.parse(serializeTemplate(template)), TEMPLATE_TABLE, copy.sysId)
            await TemplateService.update(copy.sysId, { body: JSON.stringify(stored) })
            local.clear()
            setSaved(snapshot(meta, template))
            toast(`Saved your changes as “${copy.name}”.`)
            navigate('edit', { id: copy.sysId })
        } catch (failure) {
            setSaveError(failure instanceof Error ? failure.message : 'The copy could not be saved.')
        }
    }

    /** Throws the draft away: the editor goes back to the published template. */
    const discardDraft = async () => {
        if (!loaded) return
        setConfirmDiscard(false)
        try {
            await TemplateService.update(loaded.record.sysId, { draftBody: '' })
            local.clear()
            setSaved(meta && template ? snapshot(meta, template) : saved)
            setReloads(count => count + 1)
            toast('Unpublished changes discarded.')
        } catch (failure) {
            setSaveError(failure instanceof Error ? failure.message : 'The draft could not be discarded.')
        }
    }

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void saveDraft()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [saveDraft])

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
        return (
            <ChartEditorView
                key={chartOpened.record.sysId}
                record={chartOpened.record}
                schema={chartOpened.schema}
                navigate={navigate}
            />
        )
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
                    {record && record.version > 0 && <Badge tone="outline">v{record.version}</Badge>}
                    {dirty ? (
                        <Badge tone="warning">Unsaved</Badge>
                    ) : (
                        record?.hasDraft && <Badge tone="warning">Unpublished draft</Badge>
                    )}
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
                            ...(canEdit
                                ? [{ value: 'history' as const, label: 'History', icon: 'history' as const }]
                                : []),
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
                    <Button
                        icon="download"
                        onClick={() => guarded(() => navigate('export', { template: loaded.record.sysId }))}
                    >
                        Export
                    </Button>
                    {canEdit && (
                        <Button
                            variant={publishesOnSave ? 'primary' : 'secondary'}
                            icon="save"
                            busy={saving && !publishing}
                            disabled={!dirty}
                            onClick={() => void saveDraft()}
                            title={publishesOnSave ? 'Save and publish (Ctrl+S)' : 'Save a draft (Ctrl+S)'}
                        >
                            Save
                        </Button>
                    )}
                    {canEdit && !publishesOnSave && (
                        <Button
                            variant="primary"
                            icon="publish"
                            disabled={!unpublished || saving}
                            onClick={() => setPublishing(true)}
                            title="Make these changes what exports, decks and presentations use"
                        >
                            Publish
                        </Button>
                    )}
                    {canEdit && record?.hasDraft && (
                        <Menu
                            label="Draft actions"
                            items={[
                                {
                                    label: 'Discard unpublished changes',
                                    icon: 'trash',
                                    danger: true,
                                    onSelect: () => setConfirmDiscard(true),
                                },
                            ]}
                        />
                    )}
                </div>
            </header>

            <div className="tp-editor__notices">
                {!canEdit && (
                    <Notice
                        kind="info"
                        lines={[
                            'You can look at this template and export with it, but only Templater editors can change it.',
                        ]}
                    />
                )}
                <Notice
                    kind="critical"
                    lines={saveError ? [saveError] : []}
                    onDismiss={saveError ? () => setSaveError('') : undefined}
                />
                <Notice
                    kind="warning"
                    lines={parseNote ? [parseNote] : []}
                    onDismiss={parseNote ? () => setParseNote('') : undefined}
                />
                {canEdit && leftOver && local.found && (
                    <Notice
                        kind="warning"
                        title="Unsaved changes from earlier"
                        lines={[
                            `Changes you made on ${new Date(local.found.savedAt).toLocaleString()} were never saved, and were kept in this browser.${
                                local.found.modCount !== record?.modCount
                                    ? ' The template has been saved since then, so restoring them replaces what is there now when you save.'
                                    : ''
                            }`,
                            ...droppedNote(local.found.droppedPictures),
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
                                    setTemplate(kept.template)
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
                {record?.hasDraft && !dirty && (
                    <Notice
                        kind="info"
                        lines={[
                            'You are looking at unpublished changes. Exports, decks and presentations use the published version until you publish.',
                        ]}
                    />
                )}
            </div>

            {tab === 'history' && record ? (
                <HistoryPanel
                    sysId={record.sysId}
                    kind={kind}
                    fields={loaded.schema.fields}
                    current={template}
                    canEdit={canEdit}
                    onRestore={(restored, version) => {
                        setTemplate(restored)
                        setTab('design')
                        toast(`Version ${version.version} is in the editor. Save or publish to keep it.`, 'info')
                    }}
                />
            ) : tab === 'design' ? (
                <>
                    <NarrowNotice editor="designer">
                        <Button icon="settings" onClick={() => setTab('settings')}>
                            Settings
                        </Button>
                        <Button
                            icon="download"
                            onClick={() => guarded(() => navigate('export', { template: loaded.record.sysId }))}
                        >
                            Export
                        </Button>
                    </NarrowNotice>
                    <div className="tp-wide-only--designer tp-grow-column">
                        <Designer
                            template={template}
                            onChange={setTemplate}
                            kind={kind}
                            schema={loaded.schema}
                            title={title}
                            previewRecord={previewRecord}
                            onPreviewRecordChange={setPreviewRecord}
                        />
                    </div>
                </>
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
                                <TablePicker
                                    value={meta.table}
                                    label={meta.tableLabel}
                                    onChange={(table, label) => void changeTable(table, label)}
                                />
                            </Field>
                        </div>
                    </section>

                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">Default records</h2>
                            <p className="tp-muted">
                                Where a {kind === 'deck' ? 'deck' : 'batch export'} starts. People can change it when
                                they {kind === 'deck' ? 'present' : 'export'}.
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
                    local.clear()
                    go?.()
                }}
                onCancel={() => setPending(null)}
            />
            <ConfirmModal
                open={confirmDiscard}
                title="Discard unpublished changes?"
                message="The draft is deleted and the editor goes back to the published version. This cannot be undone."
                confirmLabel="Discard changes"
                danger
                onConfirm={() => void discardDraft()}
                onCancel={() => setConfirmDiscard(false)}
            />
            <PublishModal
                open={publishing}
                version={(record?.version ?? 0) + 1}
                busy={saving}
                onClose={() => setPublishing(false)}
                onPublish={note => {
                    setPublishing(false)
                    void save({ publish: true, note })
                }}
            />
            <ConflictModal
                conflict={conflict}
                what="template"
                onClose={() => setConflict(null)}
                onReload={() => {
                    setConflict(null)
                    setSaved(meta && template ? snapshot(meta, template) : saved)
                    setReloads(count => count + 1)
                }}
                onOverwrite={() => {
                    setConflict(null)
                    void save({ publish: publishesOnSave, force: true })
                }}
                onSaveCopy={() => void saveCopy()}
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
                                    void navigator.clipboard
                                        ?.writeText(json)
                                        .then(() => toast('Copied the template body.', 'info')),
                            },
                            {
                                label: 'Download JSON',
                                icon: 'download',
                                onSelect: () =>
                                    downloadBytes(new TextEncoder().encode(json), fileName, 'application/json'),
                            },
                        ]}
                    />
                </div>
                <p className="tp-muted">
                    The document described as data — page, style, blocks — with any logos inside it as images. Paste a
                    body from another instance here to copy a template across.
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
