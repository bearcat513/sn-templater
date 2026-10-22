import React, { useEffect, useMemo, useState } from 'react'
import { storePictures } from '../data/pictures'
import { useSession } from '../data/session'
import { openTemplate } from '../data/templates'
import { UsageList } from '../designer/PublishModal'
import { galleryFor, GALLERY, type GalleryTemplate } from '../engine/gallery'
import { TEMPLATE_KIND_LABELS, starterChart, starterTemplate, type TemplateKind } from '../engine/template'
import { serializeChartTemplate, serializeTemplate } from '../engine/validate'
import { useAsync } from '../hooks/useAsync'
import type { Navigate } from '../hooks/useRoute'
import { SchemaService } from '../services/schema'
import { TEMPLATE_TABLE, TemplateService, type TemplateRecord } from '../services/templates'
import { Icon } from '../ui/icons'
import {
    Badge,
    Button,
    EmptyState,
    Field,
    Input,
    Notice,
    Segmented,
    Select,
    Spinner,
    Switch,
    Textarea,
    cx,
} from '../ui/controls'
import { ConfirmModal, Menu, Modal, useToast } from '../ui/overlays'
import { KIND_ICONS, TablePicker } from './common'
import { TemplateThumbnail } from './TemplateThumbnail'

/** The list's sort and grouping, remembered in this browser. */
const readPreference = (name: string, fallback: string): string => {
    try {
        return window.localStorage.getItem(`templater:templates:${name}`) ?? fallback
    } catch {
        return fallback
    }
}

const writePreference = (name: string, value: string) => {
    try {
        window.localStorage.setItem(`templater:templates:${name}`, value)
    } catch {
        // Not remembered, which is fine.
    }
}

type Filter = 'all' | TemplateKind

type Sort = 'name' | 'updated' | 'table'

const SORTS: { value: Sort; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'updated', label: 'Recently changed' },
    { value: 'table', label: 'Table' },
]

const THUMBNAIL_WIDTH = 220

/** Every template, by kind, with the way into designing, exporting and presenting. */
export function TemplatesView({ navigate }: { navigate: Navigate }) {
    const session = useSession()
    const toast = useToast()
    const templates = useAsync(() => TemplateService.list(), [])
    const [term, setTerm] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [showInactive, setShowInactive] = useState(false)
    const [creating, setCreating] = useState<TemplateKind | null>(null)
    const [deleting, setDeleting] = useState<TemplateRecord | null>(null)
    const [sort, setSort] = useState<Sort>(() => readPreference('sort', 'name') as Sort)
    const [grouped, setGrouped] = useState(() => readPreference('grouped', '') === 'true')
    const deletingUsages = useAsync(
        () => TemplateService.chartUsages(deleting!.sysId),
        [deleting?.sysId],
        deleting?.kind === 'chart'
    )

    useEffect(() => writePreference('sort', sort), [sort])
    useEffect(() => writePreference('grouped', String(grouped)), [grouped])

    const shown = useMemo(() => {
        const needle = term.trim().toLowerCase()
        const matching = (templates.data ?? []).filter(
            template =>
                (filter === 'all' || template.kind === filter) &&
                (showInactive || template.active) &&
                (!needle ||
                    template.name.toLowerCase().includes(needle) ||
                    template.table.toLowerCase().includes(needle) ||
                    template.tableLabel.toLowerCase().includes(needle) ||
                    template.description.toLowerCase().includes(needle))
        )
        const byName = (a: TemplateRecord, b: TemplateRecord) => a.name.localeCompare(b.name)
        return [...matching].sort(
            sort === 'updated'
                ? (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b)
                : sort === 'table'
                  ? (a, b) => (a.tableLabel || a.table).localeCompare(b.tableLabel || b.table) || byName(a, b)
                  : byName
        )
    }, [templates.data, term, filter, showInactive, sort])

    /** The templates in groups — one per table when grouping is on, else one group of all. */
    const groups = useMemo(() => {
        if (!grouped) return [{ key: '', label: '', items: shown }]
        const byTable = new Map<string, { key: string; label: string; items: TemplateRecord[] }>()
        for (const template of shown) {
            const group = byTable.get(template.table) ?? {
                key: template.table,
                label: template.tableLabel || template.table,
                items: [],
            }
            group.items.push(template)
            byTable.set(template.table, group)
        }
        return [...byTable.values()].sort((a, b) => a.label.localeCompare(b.label))
    }, [shown, grouped])

    const duplicate = async (template: TemplateRecord) => {
        try {
            const full = await TemplateService.get(template.sysId)
            // The copy gets the pictures as attachments of its own: they go when the original goes.
            const read = full.kind === 'chart' ? null : await openTemplate(full, [])
            const copy = await TemplateService.create({
                name: `${template.name} (copy)`.slice(0, 100),
                kind: full.kind,
                table: full.table,
                description: full.description,
                active: full.active,
                query: full.query,
                orderBy: full.orderBy,
                limit: full.limit,
                body: read?.ok ? '' : (full.body ?? ''),
            })
            if (read?.ok) {
                const stored = await storePictures(read.value, TEMPLATE_TABLE, copy.sysId)
                await TemplateService.update(copy.sysId, { body: JSON.stringify(stored) })
            }
            toast(`Made “${copy.name}”.`)
            navigate('edit', { id: copy.sysId })
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'That template could not be copied.', 'critical')
        }
    }

    const remove = async (template: TemplateRecord) => {
        setDeleting(null)
        try {
            await TemplateService.remove(template.sysId)
            toast(`Deleted “${template.name}”.`)
            templates.reload()
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'That template could not be deleted.', 'critical')
        }
    }

    return (
        <div className="tp-page">
            <header className="tp-page__header">
                <div>
                    <h1>Templates</h1>
                    <p className="tp-muted">
                        A template turns records into a PDF — fields, related lists and all — or into a slide per
                        record. A chart counts a table's records, to place in either or on a slide of its own.
                    </p>
                </div>
                {session.canEdit && (
                    <div className="tp-row">
                        <Button icon="chart" onClick={() => setCreating('chart')}>
                            New chart
                        </Button>
                        <Button icon="file" onClick={() => setCreating('document')}>
                            New PDF template
                        </Button>
                        <Button variant="primary" icon="slides" onClick={() => setCreating('deck')}>
                            New slide deck
                        </Button>
                    </div>
                )}
            </header>

            <div className="tp-toolbar">
                <div className="tp-search">
                    <Icon name="search" size={14} />
                    <Input
                        value={term}
                        onChange={event => setTerm(event.target.value)}
                        placeholder="Search by name or table"
                        aria-label="Search templates"
                    />
                </div>
                <Segmented<Filter>
                    label="Kind"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: 'All' },
                        { value: 'document', label: 'PDF documents', icon: 'file' },
                        { value: 'deck', label: 'Slide decks', icon: 'slides' },
                        { value: 'chart', label: 'Charts', icon: 'chart' },
                    ]}
                />
                <Select<Sort> value={sort} options={SORTS} onChange={setSort} aria-label="Sort templates by" />
                <Switch checked={grouped} onChange={setGrouped} label="Group by table" />
                <Switch checked={showInactive} onChange={setShowInactive} label="Show inactive" />
            </div>

            <Notice kind="critical" lines={templates.error ? [templates.error] : []} />

            {templates.loading && !templates.data ? (
                <div className="tp-loading">
                    <Spinner /> Loading templates…
                </div>
            ) : shown.length ? (
                groups.map(group => (
                    <section key={group.key} className="tp-template-group" aria-label={group.label || 'Templates'}>
                        {group.label && (
                            <h2 className="tp-template-group__title">
                                {group.label} <code>{group.key}</code>{' '}
                                <span className="tp-subtle">{group.items.length}</span>
                            </h2>
                        )}
                        <ul className="tp-cards">
                            {group.items.map(template => (
                                <li
                                    key={template.sysId}
                                    className={cx('tp-template-card', !template.active && 'is-inactive')}
                                >
                                    <button
                                        type="button"
                                        className="tp-template-card__main"
                                        onClick={() =>
                                            session.canEdit || template.kind === 'chart'
                                                ? navigate('edit', { id: template.sysId })
                                                : navigate(template.kind === 'deck' ? 'present' : 'export', {
                                                      template: template.sysId,
                                                  })
                                        }
                                    >
                                        <TemplateThumbnail
                                            template={template}
                                            icon={KIND_ICONS[template.kind]}
                                            width={THUMBNAIL_WIDTH}
                                        />
                                        <span className="tp-template-card__name">{template.name}</span>
                                        <span className="tp-template-card__table">
                                            {template.tableLabel || template.table} <code>{template.table}</code>
                                        </span>
                                        {template.description && (
                                            <span className="tp-template-card__desc">{template.description}</span>
                                        )}
                                        <span className="tp-template-card__meta">
                                            <Badge
                                                tone={
                                                    template.kind === 'deck'
                                                        ? 'primary'
                                                        : template.kind === 'chart'
                                                          ? 'positive'
                                                          : 'neutral'
                                                }
                                            >
                                                {TEMPLATE_KIND_LABELS[template.kind]}
                                            </Badge>
                                            {!template.active && <Badge tone="warning">Inactive</Badge>}
                                            {template.hasDraft && <Badge tone="warning">Unpublished changes</Badge>}
                                            {template.version > 0 && <Badge tone="outline">v{template.version}</Badge>}
                                            <span className="tp-subtle tp-truncate">
                                                {template.updatedBy} · {template.updatedOn}
                                            </span>
                                        </span>
                                    </button>
                                    <div className="tp-template-card__actions">
                                        {template.kind === 'deck' ? (
                                            <Button
                                                size="sm"
                                                icon="play"
                                                onClick={() => navigate('present', { template: template.sysId })}
                                            >
                                                Present
                                            </Button>
                                        ) : null}
                                        {template.kind === 'chart' ? (
                                            <Button
                                                size="sm"
                                                icon="eye"
                                                onClick={() => navigate('edit', { id: template.sysId })}
                                            >
                                                Open
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                icon="download"
                                                onClick={() => navigate('export', { template: template.sysId })}
                                            >
                                                Export
                                            </Button>
                                        )}
                                        {session.canEdit && (
                                            <Menu
                                                label={`More actions for ${template.name}`}
                                                items={[
                                                    {
                                                        label: 'Edit',
                                                        icon: 'settings',
                                                        onSelect: () => navigate('edit', { id: template.sysId }),
                                                    },
                                                    {
                                                        label: 'Duplicate',
                                                        icon: 'copy',
                                                        onSelect: () => void duplicate(template),
                                                    },
                                                    {
                                                        label: 'Delete',
                                                        icon: 'trash',
                                                        danger: true,
                                                        onSelect: () => setDeleting(template),
                                                    },
                                                ]}
                                            />
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))
            ) : (
                <EmptyState
                    icon="layers"
                    title={templates.data?.length ? 'No templates match' : 'No templates yet'}
                    action={
                        session.canEdit && !templates.data?.length ? (
                            <Button variant="primary" icon="plus" onClick={() => setCreating('document')}>
                                Create the first one
                            </Button>
                        ) : undefined
                    }
                >
                    {templates.data?.length
                        ? 'Try another search, or show inactive templates.'
                        : session.canEdit
                          ? 'Start from a table: the first template opens on that table’s own fields.'
                          : 'Ask a Templater editor to create one.'}
                </EmptyState>
            )}

            <NewTemplateModal
                kind={creating}
                onClose={() => setCreating(null)}
                onCreated={template => {
                    setCreating(null)
                    navigate('edit', { id: template.sysId })
                }}
            />

            <ConfirmModal
                open={Boolean(deleting)}
                title="Delete this template?"
                message={
                    <div className="tp-stack">
                        <p>
                            “{deleting?.name}” will be gone for everyone, with its version history. Documents already
                            exported are not affected.
                        </p>
                        {deleting?.kind === 'chart' &&
                            (deletingUsages.loading ? (
                                <p className="tp-row tp-subtle">
                                    <Spinner size={14} /> Looking for where it is placed…
                                </p>
                            ) : deletingUsages.data?.length ? (
                                <Notice
                                    kind="warning"
                                    title={`It is placed in ${deletingUsages.data.length} other place${deletingUsages.data.length === 1 ? '' : 's'}, which will show nothing where it was`}
                                >
                                    <UsageList usages={deletingUsages.data} />
                                </Notice>
                            ) : null)}
                    </div>
                }
                confirmLabel="Delete template"
                danger
                onConfirm={() => deleting && void remove(deleting)}
                onCancel={() => setDeleting(null)}
            />
        </div>
    )
}

/**
 * A name, a kind and a table — and the template opens on that table's own
 * fields, or as a copy of one of the gallery's ready-made templates.
 */
function NewTemplateModal({
    kind,
    onClose,
    onCreated,
}: {
    kind: TemplateKind | null
    onClose: () => void
    onCreated: (template: TemplateRecord) => void
}) {
    const [name, setName] = useState('')
    const [chosenKind, setChosenKind] = useState<TemplateKind>('document')
    const [table, setTable] = useState({ name: '', label: '' })
    const [description, setDescription] = useState('')
    // The gallery template to copy, by key; empty is a fresh starter.
    const [start, setStart] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const [openedFor, setOpenedFor] = useState<TemplateKind | null>(null)
    if (kind && kind !== openedFor) {
        setOpenedFor(kind)
        setChosenKind(kind)
        setName('')
        setDescription('')
        setTable({ name: '', label: '' })
        setStart('')
        setError('')
    }
    if (!kind && openedFor) setOpenedFor(null)

    const starting = GALLERY.find(entry => entry.key === start) ?? null
    const gallery = galleryFor(chosenKind)

    const chooseKind = (next: TemplateKind) => {
        setChosenKind(next)
        if (starting && starting.kind !== next) chooseStart(null)
    }

    /** Picking a gallery template fills in what it is for, unless it was already typed. */
    const chooseStart = (entry: GalleryTemplate | null) => {
        const typed = (value: string, previous: string | undefined) => value.trim() !== '' && value !== previous
        if (!typed(name, starting?.name)) setName(entry?.name ?? '')
        if (!typed(description, starting?.description)) setDescription(entry?.description ?? '')
        setStart(entry?.key ?? '')
        if (!entry) return
        setTable({ name: entry.table, label: '' })
        SchemaService.table(entry.table)
            .then(schema =>
                setTable(current =>
                    current.name === entry.table ? { name: entry.table, label: schema.label } : current
                )
            )
            .catch(() => undefined)
    }

    const create = async () => {
        if (!name.trim() || !table.name) {
            setError('Give the template a name and a table.')
            return
        }
        setBusy(true)
        setError('')
        try {
            const schema = await SchemaService.table(table.name)
            const defaults = starting
                ? {
                      query: starting.query,
                      orderBy: starting.orderBy,
                      limit: starting.limit,
                      body: serializeTemplate(starting.body),
                  }
                : {
                      query:
                          chosenKind !== 'document' && schema.fields.some(field => field.name === 'active')
                              ? 'active=true'
                              : '',
                      orderBy: '-sys_updated_on',
                      limit: chosenKind === 'deck' ? 20 : 50,
                      body:
                          chosenKind === 'chart'
                              ? serializeChartTemplate(starterChart(schema.fields, schema.label))
                              : serializeTemplate(starterTemplate(chosenKind, schema.fields)),
                  }
            const created = await TemplateService.create({
                name: name.trim(),
                kind: chosenKind,
                table: schema.name,
                description: description.trim(),
                active: true,
                query: defaults.query,
                orderBy: defaults.orderBy,
                limit: defaults.limit,
                body: defaults.body,
            })
            onCreated(created)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'The template could not be created.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={Boolean(kind)}
            title="New template"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" busy={busy} onClick={() => void create()}>
                        Create and design
                    </Button>
                </>
            }
        >
            <form
                className="tp-stack"
                onSubmit={event => {
                    event.preventDefault()
                    void create()
                }}
            >
                <div className="tp-kind-choice" role="radiogroup" aria-label="Kind">
                    {(['document', 'deck', 'chart'] as TemplateKind[]).map(option => (
                        <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={chosenKind === option}
                            className={cx('tp-kind-choice__item', chosenKind === option && 'is-selected')}
                            onClick={() => chooseKind(option)}
                        >
                            <span className={cx('tp-choice__icon', `tp-kind--${option}`)}>
                                <Icon name={KIND_ICONS[option]} size={20} />
                            </span>
                            <strong>{TEMPLATE_KIND_LABELS[option]}</strong>
                            <span className="tp-subtle">
                                {option === 'deck'
                                    ? 'One slide per record, presented here or exported as a PDF.'
                                    : option === 'chart'
                                      ? 'A table’s records counted by a field, to place in templates and on slides.'
                                      : 'A record with its related lists, as a PDF to download or attach.'}
                            </span>
                        </button>
                    ))}
                </div>
                {chosenKind !== 'chart' && (
                    <Field label="Start from" hint="A ready-made template is copied, so the copy is yours to change.">
                        <div className="tp-choices" role="radiogroup" aria-label="Start from">
                            {[null, ...gallery].map(entry => {
                                const selected = (entry?.key ?? '') === start
                                return (
                                    <button
                                        key={entry?.key ?? 'blank'}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        className={cx('tp-choice', selected && 'is-selected')}
                                        onClick={() => chooseStart(entry)}
                                    >
                                        <span className={cx('tp-choice__icon', `tp-kind--${chosenKind}`)}>
                                            <Icon name={entry ? KIND_ICONS[chosenKind] : 'plus'} />
                                        </span>
                                        <span className="tp-choice__text">
                                            <span className="tp-choice__name">{entry ? entry.name : 'Blank'}</span>
                                            <span className="tp-choice__meta">
                                                {entry ? entry.table : 'Built from the table’s own fields'}
                                            </span>
                                        </span>
                                        {selected && <Icon name="check" className="tp-choice__check" />}
                                    </button>
                                )
                            })}
                        </div>
                    </Field>
                )}
                <Field label="Name" htmlFor="new-template-name">
                    <Input
                        id="new-template-name"
                        value={name}
                        maxLength={100}
                        onChange={event => setName(event.target.value)}
                        placeholder={
                            chosenKind === 'deck'
                                ? 'Weekly major incident review'
                                : chosenKind === 'chart'
                                  ? 'Open incidents by priority'
                                  : 'Incident report'
                        }
                        autoFocus
                    />
                </Field>
                <Field
                    label="Table"
                    hint="The records this template is for. Tables that extend it can use it too."
                    htmlFor="new-template-table"
                >
                    <TablePicker
                        id="new-template-table"
                        value={table.name}
                        label={table.label}
                        onChange={(tableName, label) => {
                            // Another table is another schema: the gallery copy was written for its own.
                            if (starting && tableName !== starting.table) setStart('')
                            setTable({ name: tableName, label })
                        }}
                    />
                </Field>
                <Field label="Description" htmlFor="new-template-description">
                    <Textarea
                        id="new-template-description"
                        rows={2}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        placeholder="What it is for, and who uses it"
                    />
                </Field>
                <Notice kind="critical" lines={error ? [error] : []} />
            </form>
        </Modal>
    )
}
