import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './icons'
import { Spinner, cx } from './controls'

export type ComboOption = {
    value: string
    label: string
    /** A second, smaller line: a table name under its label, a field type. */
    detail?: string
}

type Props = {
    /** The chosen value; the input shows `selectedLabel` (or the value) when not typing. */
    value: string
    selectedLabel?: string
    onChange: (option: ComboOption) => void
    /** Synchronous options, filtered here — or `search`, which filters on the server. */
    options?: ComboOption[]
    search?: (term: string) => Promise<ComboOption[]>
    placeholder?: string
    /** Accept what was typed as a value when nothing matches it. */
    allowCustom?: boolean
    disabled?: boolean
    id?: string
    'aria-label'?: string
    className?: string
}

const filterOptions = (options: ComboOption[], term: string): ComboOption[] => {
    const needle = term.trim().toLowerCase()
    if (!needle) return options.slice(0, 100)
    return options
        .filter(
            option =>
                option.label.toLowerCase().includes(needle) ||
                option.value.toLowerCase().includes(needle) ||
                option.detail?.toLowerCase().includes(needle)
        )
        .slice(0, 100)
}

/**
 * A text box with a list under it: type to narrow, arrows to move, Enter to
 * choose. Follows the ARIA combobox pattern, so a screen reader announces the
 * list and the option in focus.
 */
export function Combobox({
    value,
    selectedLabel,
    onChange,
    options,
    search,
    placeholder,
    allowCustom,
    disabled,
    id,
    className,
    'aria-label': ariaLabel,
}: Props) {
    const listId = useId()
    const [open, setOpen] = useState(false)
    const [term, setTerm] = useState('')
    const [results, setResults] = useState<ComboOption[]>([])
    const [active, setActive] = useState(0)
    const [loading, setLoading] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const request = useRef(0)

    /* ------------------------------ results ------------------------------ */

    useEffect(() => {
        if (!open) return
        if (!search) {
            setResults(filterOptions(options ?? [], term))
            setActive(0)
            return
        }
        const ticket = ++request.current
        setLoading(true)
        const timer = window.setTimeout(() => {
            search(term)
                .then(found => {
                    if (ticket !== request.current) return
                    setResults(found)
                    setActive(0)
                })
                .catch(() => ticket === request.current && setResults([]))
                .finally(() => ticket === request.current && setLoading(false))
        }, 220)
        return () => window.clearTimeout(timer)
    }, [open, term, options, search])

    useEffect(() => {
        if (!open) return
        const onDown = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) close()
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    /* ------------------------------ choosing ----------------------------- */

    const close = () => {
        setOpen(false)
        setTerm('')
    }

    const choose = (option: ComboOption) => {
        onChange(option)
        close()
    }

    const typed = term.trim()
    const customOption: ComboOption | null =
        allowCustom && typed && !results.some(option => option.value === typed)
            ? { value: typed, label: typed, detail: 'Use what you typed' }
            : null
    const shown = customOption ? [...results, customOption] : results

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) setOpen(true)
            setActive(index => Math.min(index + 1, shown.length - 1))
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive(index => Math.max(index - 1, 0))
        } else if (event.key === 'Enter') {
            if (!open) return
            event.preventDefault()
            const option = shown[active]
            if (option) choose(option)
        } else if (event.key === 'Escape') {
            if (open) {
                event.preventDefault()
                event.stopPropagation()
                close()
            }
        }
    }

    const display = open ? term : (selectedLabel ?? value)
    const activeId = open && shown[active] ? `${listId}-${active}` : undefined

    return (
        <div className={cx('tp-combo', open && 'is-open', className)} ref={root}>
            <div className="tp-combo__control">
                <Icon name="search" size={14} className="tp-combo__search" />
                <input
                    id={id}
                    className="tp-input tp-combo__input"
                    role="combobox"
                    aria-label={ariaLabel}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    placeholder={open ? (selectedLabel ?? placeholder) : placeholder}
                    value={display}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onChange={event => {
                        setTerm(event.target.value)
                        if (!open) setOpen(true)
                    }}
                    onKeyDown={onKeyDown}
                />
                {loading ? <Spinner size={14} /> : <Icon name="chevronDown" size={14} className="tp-combo__chevron" />}
            </div>
            {open && (
                <ul className="tp-combo__list" id={listId} role="listbox">
                    {shown.map((option, index) => (
                        <li
                            key={`${option.value}-${index}`}
                            id={`${listId}-${index}`}
                            role="option"
                            aria-selected={option.value === value}
                            className={cx(
                                'tp-combo__option',
                                index === active && 'is-active',
                                option.value === value && 'is-selected'
                            )}
                            onMouseEnter={() => setActive(index)}
                            onMouseDown={event => {
                                event.preventDefault()
                                choose(option)
                            }}
                        >
                            <span className="tp-combo__label">{option.label}</span>
                            {option.detail && <span className="tp-combo__detail">{option.detail}</span>}
                        </li>
                    ))}
                    {!shown.length && (
                        <li className="tp-combo__empty" role="presentation">
                            {loading ? 'Searching…' : typed ? 'Nothing matches.' : 'Type to search.'}
                        </li>
                    )}
                </ul>
            )}
        </div>
    )
}
