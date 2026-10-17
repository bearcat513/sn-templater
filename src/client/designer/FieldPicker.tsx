import React, { useMemo } from 'react'
import type { SchemaField } from '../engine/vocabulary'
import { Combobox, type ComboOption } from '../ui/Combobox'

/**
 * Choosing a field of a table. A path the list does not have — a dot-walk
 * like `assigned_to.email` — can be typed and used as it is.
 */
export function FieldPicker({
    fields,
    value,
    onChange,
    placeholder = 'Choose a field',
    'aria-label': ariaLabel,
}: {
    fields: SchemaField[]
    value: string
    onChange: (field: SchemaField) => void
    placeholder?: string
    'aria-label'?: string
}) {
    const options = useMemo<ComboOption[]>(
        () =>
            fields.map(field => ({
                value: field.name,
                label: field.label,
                detail: field.reference ? `${field.name} → ${field.reference}` : `${field.name} · ${field.type}`,
            })),
        [fields]
    )
    const selected = fields.find(field => field.name === value)

    return (
        <Combobox
            value={value}
            selectedLabel={selected ? selected.label : value}
            options={options}
            allowCustom
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={option =>
                onChange(
                    fields.find(field => field.name === option.value) ?? {
                        name: option.value,
                        label: option.value,
                        type: 'string',
                    }
                )
            }
        />
    )
}
