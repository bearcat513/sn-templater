import React, { useCallback, useEffect, useState } from 'react'
import { RecordService } from '../services/records'
import type { TableSchema } from '../services/schema'
import { Combobox, type ComboOption } from '../ui/Combobox'

/**
 * Choosing one record of a table, by its number or display value. Opens on
 * the most recently updated, which is usually the one somebody is thinking of.
 */
export function RecordPicker({
    schema,
    value,
    onChange,
    placeholder = 'Search records',
    'aria-label': ariaLabel = 'Record',
}: {
    schema: TableSchema
    value: string
    onChange: (sysId: string, label: string) => void
    placeholder?: string
    'aria-label'?: string
}) {
    const hasNumber = schema.fields.some(field => field.name === 'number')
    const detailField = schema.fields.some(field => field.name === 'short_description') ? 'short_description' : undefined
    const [label, setLabel] = useState('')

    useEffect(() => {
        if (!value) {
            setLabel('')
            return
        }
        let live = true
        RecordService.summary(schema.name, value, schema.displayField, hasNumber)
            .then(summary => live && setLabel(summary.label))
            .catch(() => live && setLabel(value))
        return () => {
            live = false
        }
    }, [schema.name, schema.displayField, value, hasNumber])

    const search = useCallback(
        async (term: string): Promise<ComboOption[]> => {
            const found = await RecordService.search(schema.name, term, {
                displayField: schema.displayField,
                hasNumber,
                detailField,
            })
            return found.map(record => ({ value: record.sysId, label: record.label, detail: record.detail }))
        },
        [schema.name, schema.displayField, hasNumber, detailField]
    )

    return (
        <Combobox
            value={value}
            selectedLabel={label || value}
            search={search}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={option => {
                setLabel(option.label)
                onChange(option.value, option.label)
            }}
        />
    )
}
