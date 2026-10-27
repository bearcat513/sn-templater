import React from 'react'
import { type BlockCondition, type Condition, type ConditionTest } from '../engine/template'
import { Button, Field, IconButton, Segmented, Select, Switch } from '../ui/controls'
import { TokenField } from './TokenTarget'

const TESTS: { value: ConditionTest; label: string }[] = [
    { value: 'notEmpty', label: 'is not empty' },
    { value: 'empty', label: 'is empty' },
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'greater', label: 'is more than' },
    { value: 'less', label: 'is less than' },
]

/** Most comparisons the designer offers in one group. The reader keeps twelve. */
const MAX_ROWS = 12

const isGroup = (condition: Condition): condition is { all: Condition[] } | { any: Condition[] } =>
    'all' in condition || 'any' in condition

const entriesOf = (condition: Condition): Condition[] =>
    'all' in condition ? condition.all : 'any' in condition ? condition.any : [condition]

const matchOf = (condition: Condition): 'all' | 'any' => ('any' in condition ? 'any' : 'all')

/** The entries back as a condition: one on its own, several as a group. None is no condition. */
function rebuild(match: 'all' | 'any', entries: Condition[]): Condition | undefined {
    if (!entries.length) return undefined
    if (entries.length === 1) return entries[0]
    return match === 'all' ? { all: entries } : { any: entries }
}

/**
 * "Show only when…": a condition for a block, a repeat's rows, or the cover,
 * letterhead and watermark. One comparison, or several that must all — or any
 * one of them — hold. A group a script nested inside another is shown, and
 * can be removed, but is edited in the body's JSON.
 */
export function ConditionFields({
    value,
    onChange,
    label = 'Show only when…',
    fallback = { value: '{{record.state}}', test: 'notEmpty' },
    hint,
}: {
    value: Condition | undefined
    onChange: (when: Condition | undefined) => void
    label?: string
    /** What switching it on starts from. */
    fallback?: BlockCondition
    hint?: string
}) {
    const entries = value ? entriesOf(value) : []
    const match = value ? matchOf(value) : 'all'
    const change = (next: Condition[], nextMatch = match) => onChange(rebuild(nextMatch, next))

    return (
        <div className="tp-condition tp-stack tp-stack--tight">
            <Switch checked={Boolean(value)} onChange={on => onChange(on ? fallback : undefined)} label={label} />
            {hint && value && <p className="tp-field__hint">{hint}</p>}
            {value && entries.length > 1 && (
                <Segmented<'all' | 'any'>
                    size="sm"
                    label="How the conditions combine"
                    value={match}
                    options={[
                        { value: 'all', label: 'All of these' },
                        { value: 'any', label: 'Any of these' },
                    ]}
                    onChange={next => change(entries, next)}
                />
            )}
            {entries.map((entry, index) =>
                isGroup(entry) ? (
                    <div key={index} className="tp-condition__nested tp-row">
                        <span className="tp-muted tp-truncate">
                            {matchOf(entry) === 'all' ? 'All of: ' : 'Any of: '}
                            {entriesOf(entry).map(describeCondition).join('; ')}
                        </span>
                        <IconButton
                            icon="trash"
                            label="Remove this group"
                            size="sm"
                            onClick={() => change(entries.filter((_, at) => at !== index))}
                        />
                    </div>
                ) : (
                    <ComparisonRow
                        key={index}
                        condition={entry}
                        removable={entries.length > 1}
                        onChange={next => change(entries.map((item, at) => (at === index ? next : item)))}
                        onRemove={() => change(entries.filter((_, at) => at !== index))}
                    />
                )
            )}
            {value && entries.length < MAX_ROWS && (
                <div>
                    <Button
                        size="sm"
                        variant="ghost"
                        icon="plus"
                        onClick={() => change([...entries, { value: '', test: 'notEmpty' }])}
                    >
                        Add a condition
                    </Button>
                </div>
            )}
        </div>
    )
}

function ComparisonRow({
    condition,
    removable,
    onChange,
    onRemove,
}: {
    condition: BlockCondition
    removable: boolean
    onChange: (condition: BlockCondition) => void
    onRemove: () => void
}) {
    const needsValue = condition.test !== 'empty' && condition.test !== 'notEmpty'
    return (
        <div className="tp-condition__row">
            <div className="tp-grid tp-grid--3">
                <Field label="This" hint="Usually one token, like {{raw.priority}}.">
                    <TokenField value={condition.value} onChange={value => onChange({ ...condition, value })} />
                </Field>
                <Field label="Test">
                    <Select<ConditionTest>
                        value={condition.test}
                        options={TESTS}
                        aria-label="Condition test"
                        onChange={test => onChange({ ...condition, test })}
                    />
                </Field>
                {needsValue && (
                    <Field label="Value">
                        <TokenField value={condition.to ?? ''} onChange={to => onChange({ ...condition, to })} />
                    </Field>
                )}
            </div>
            {removable && <IconButton icon="trash" label="Remove this condition" size="sm" onClick={onRemove} />}
        </div>
    )
}

/** A condition in words, for a collapsed block's summary. */
export function describeCondition(when: Condition): string {
    if ('all' in when) return when.all.map(describeCondition).join(' and ')
    if ('any' in when) return `(${when.any.map(describeCondition).join(' or ')})`
    return `${when.value} ${TESTS.find(test => test.value === when.test)?.label ?? when.test}${
        when.to && when.test !== 'empty' && when.test !== 'notEmpty' ? ` ${when.to}` : ''
    }`
}
