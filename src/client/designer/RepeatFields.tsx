import React, { useMemo } from 'react'
import {
    MAX_RELATED_ROWS,
    type ConditionTest,
    type BlockCondition,
    type PdfBlock,
    type RepeatBlock,
    type TemplateKind,
} from '../engine/template'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Combobox, type ComboOption } from '../ui/Combobox'
import { Field, NumberInput, Select, Switch, Textarea } from '../ui/controls'
import { useToast } from '../ui/overlays'
import { BlockList } from './BlockList'
import { FieldPicker } from './FieldPicker'
import { TokenField, useTokenTarget } from './TokenTarget'

/**
 * A repeat: which related records, and the blocks drawn once for each — a
 * block list of its own, whose text can use the row's fields as
 * `{{row.<field>}}` alongside the record's own tokens.
 */
export function RepeatFields({
    block,
    schema,
    kind,
    onChange,
}: {
    block: RepeatBlock
    schema: TableSchema
    kind: TemplateKind
    onChange: (changes: Partial<RepeatBlock>) => void
}) {
    const related = useAsync(() => SchemaService.table(block.table), [block.table], Boolean(block.table))
    const target = useTokenTarget()
    const toast = useToast()

    const options = useMemo<ComboOption[]>(
        () =>
            schema.relationships.map(entry => ({
                value: `${entry.table}.${entry.field}`,
                label: `${entry.tableLabel} › ${entry.fieldLabel}`,
                detail: `${entry.table}.${entry.field}`,
            })),
        [schema.relationships]
    )
    const current = block.table ? `${block.table}.${block.field}` : ''
    const currentEntry = schema.relationships.find(entry => entry.table === block.table && entry.field === block.field)
    const descending = (block.orderBy ?? '').startsWith('-')
    const orderField = (block.orderBy ?? '').replace(/^-/, '')

    /** A row field as a token: into the box being typed in, or onto the clipboard. */
    const insertField = (name: string) => {
        const text = `{{row.${name}}}`
        if (target.insert(text)) return
        void navigator.clipboard?.writeText(text).then(
            () => toast(`Copied ${text}. Click into one of the repeated blocks' text to insert it there.`, 'info'),
            () => toast(`Click into a text box first, then choose ${text}.`, 'info')
        )
    }

    return (
        <div className="tp-stack">
            <Field label="For each record that references this one">
                <Combobox
                    value={current}
                    selectedLabel={currentEntry ? `${currentEntry.tableLabel} › ${currentEntry.fieldLabel}` : current}
                    options={options}
                    allowCustom
                    placeholder="Choose the related records"
                    aria-label="Related records to repeat for"
                    onChange={option => {
                        const [table, ...rest] = option.value.split('.')
                        if (table && rest.length) onChange({ table, field: rest.join('.') })
                    }}
                />
            </Field>
            {block.table && (
                <>
                    <Field label="Filter" hint="An encoded query, ANDed on — e.g. active=true.">
                        <Textarea
                            className="tp-mono"
                            rows={2}
                            value={block.query ?? ''}
                            spellCheck={false}
                            placeholder="active=true"
                            onChange={event => onChange({ query: event.target.value || undefined })}
                        />
                    </Field>
                    <div className="tp-grid tp-grid--3">
                        <Field label="Sort by">
                            <FieldPicker
                                fields={related.data?.fields ?? []}
                                value={orderField}
                                placeholder="Unsorted"
                                aria-label="Sort by"
                                onChange={field => onChange({ orderBy: `${descending ? '-' : ''}${field.name}` })}
                            />
                        </Field>
                        <Field label="Direction">
                            <Select<'asc' | 'desc'>
                                value={descending ? 'desc' : 'asc'}
                                options={[
                                    { value: 'asc', label: 'Ascending' },
                                    { value: 'desc', label: 'Descending' },
                                ]}
                                disabled={!orderField}
                                aria-label="Sort direction"
                                onChange={direction =>
                                    onChange({ orderBy: `${direction === 'desc' ? '-' : ''}${orderField}` })
                                }
                            />
                        </Field>
                        <Field label="At most (rows)">
                            <NumberInput
                                min={1}
                                max={MAX_RELATED_ROWS}
                                value={block.limit}
                                aria-label="Row limit"
                                onChange={limit => onChange({ limit })}
                            />
                        </Field>
                    </div>
                    <Field label="When there are none" hint="Printed instead. Empty prints nothing.">
                        <TokenField
                            value={block.emptyText ?? ''}
                            onChange={emptyText => onChange({ emptyText: emptyText || undefined })}
                        />
                    </Field>
                    <Field
                        label="Each row’s fields"
                        hint="Click one to insert it as {{row.field}}. {{row.index}} and {{row.count}} number the rows."
                    >
                        <div className="tp-row tp-row--wrap">
                            {['index', 'count', ...(related.data?.fields ?? []).map(field => field.name)]
                                .slice(0, 60)
                                .map(name => (
                                    <button
                                        key={name}
                                        type="button"
                                        className="tp-chip"
                                        onClick={() => insertField(name)}
                                    >
                                        {related.data?.fields.find(field => field.name === name)?.label ?? name}
                                    </button>
                                ))}
                        </div>
                    </Field>
                </>
            )}
            <Field label="Drawn for each row">
                <BlockList
                    blocks={block.blocks}
                    onChange={blocks => onChange({ blocks })}
                    kind={kind}
                    schema={schema}
                    label="Repeated blocks"
                    nested
                />
            </Field>
        </div>
    )
}

const TESTS: { value: ConditionTest; label: string }[] = [
    { value: 'notEmpty', label: 'is not empty' },
    { value: 'empty', label: 'is empty' },
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'greater', label: 'is more than' },
    { value: 'less', label: 'is less than' },
]

/** "Show only when…": the condition every block can have. */
export function ConditionFields({
    block,
    onChange,
}: {
    block: PdfBlock
    onChange: (when: BlockCondition | undefined) => void
}) {
    const when = block.when
    const needsValue = when && when.test !== 'empty' && when.test !== 'notEmpty'
    return (
        <div className="tp-condition tp-stack tp-stack--tight">
            <Switch
                checked={Boolean(when)}
                onChange={on => onChange(on ? { value: '{{record.state}}', test: 'notEmpty' } : undefined)}
                label="Show only when…"
            />
            {when && (
                <div className="tp-grid tp-grid--3">
                    <Field label="This" hint="Usually one token, like {{raw.priority}}.">
                        <TokenField value={when.value} onChange={value => onChange({ ...when, value })} />
                    </Field>
                    <Field label="Test">
                        <Select<ConditionTest>
                            value={when.test}
                            options={TESTS}
                            aria-label="Condition test"
                            onChange={test => onChange({ ...when, test })}
                        />
                    </Field>
                    {needsValue && (
                        <Field label="Value">
                            <TokenField value={when.to ?? ''} onChange={to => onChange({ ...when, to })} />
                        </Field>
                    )}
                </div>
            )}
        </div>
    )
}

/** A condition in words, for a collapsed block's summary. */
export const describeCondition = (when: BlockCondition): string =>
    `only when ${when.value} ${TESTS.find(test => test.value === when.test)?.label ?? when.test}${
        when.to && when.test !== 'empty' && when.test !== 'notEmpty' ? ` ${when.to}` : ''
    }`
