import React, { forwardRef, useId, useState } from 'react'
import { Icon, type IconName } from './icons'

/* ---------------------------------------------------------------- utilities */

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: IconName
    iconAfter?: IconName
    busy?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', icon, iconAfter, busy, className, children, disabled, type, ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            type={type ?? 'button'}
            className={cx('tp-btn', `tp-btn--${variant}`, `tp-btn--${size}`, className)}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            {...rest}
        >
            {busy ? <Spinner size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
            {children !== undefined && children !== null && <span>{children}</span>}
            {iconAfter && <Icon name={iconAfter} size={size === 'sm' ? 14 : 16} />}
        </button>
    )
})

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: IconName
    label: string
    size?: ButtonSize
    tone?: 'default' | 'danger'
}

export function IconButton({ icon, label, size = 'md', tone = 'default', className, ...rest }: IconButtonProps) {
    return (
        <button
            type="button"
            className={cx('tp-icon-btn', `tp-icon-btn--${size}`, tone === 'danger' && 'tp-icon-btn--danger', className)}
            aria-label={label}
            title={label}
            {...rest}
        >
            <Icon name={icon} size={size === 'sm' ? 14 : 16} />
        </button>
    )
}

/* ------------------------------------------------------------------ fields */

/** A label, a control, and an optional hint under it. */
export function Field({
    label,
    hint,
    children,
    className,
    htmlFor,
}: {
    label?: React.ReactNode
    hint?: React.ReactNode
    children: React.ReactNode
    className?: string
    htmlFor?: string
}) {
    return (
        <div className={cx('tp-field', className)}>
            {label ? (
                <label className="tp-field__label" htmlFor={htmlFor}>
                    {label}
                </label>
            ) : null}
            {children}
            {hint ? <p className="tp-field__hint">{hint}</p> : null}
        </div>
    )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
    { className, ...rest },
    ref
) {
    return <input ref={ref} className={cx('tp-input', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function Textarea({ className, ...rest }, ref) {
        return <textarea ref={ref} className={cx('tp-input', 'tp-textarea', className)} {...rest} />
    }
)

export type SelectOption<T extends string> = { value: T; label: string }

export function Select<T extends string>({
    value,
    options,
    onChange,
    className,
    id,
    disabled,
    'aria-label': ariaLabel,
}: {
    value: T
    options: SelectOption<T>[]
    onChange: (value: T) => void
    className?: string
    id?: string
    disabled?: boolean
    'aria-label'?: string
}) {
    return (
        <div className={cx('tp-select', className)}>
            <select
                id={id}
                value={value}
                disabled={disabled}
                aria-label={ariaLabel}
                onChange={event => onChange(event.target.value as T)}
            >
                {options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <Icon name="chevronDown" size={14} className="tp-select__chevron" />
        </div>
    )
}

/** A number box that lets a person clear it while typing, and reports numbers only. */
export function NumberInput({
    value,
    onChange,
    min,
    max,
    step,
    placeholder,
    className,
    id,
    'aria-label': ariaLabel,
}: {
    value: number | undefined
    onChange: (value: number | undefined) => void
    min?: number
    max?: number
    step?: number | string
    placeholder?: string
    className?: string
    id?: string
    'aria-label'?: string
}) {
    const [draft, setDraft] = useState<string | null>(null)
    return (
        <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={className}
            value={draft ?? (value === undefined ? '' : String(value))}
            onChange={event => {
                const text = event.target.value
                setDraft(text)
                if (text === '') onChange(undefined)
                else if (Number.isFinite(Number(text))) onChange(Number(text))
            }}
            onBlur={() => setDraft(null)}
        />
    )
}

export function Switch({
    checked,
    onChange,
    label,
    id,
    disabled,
}: {
    checked: boolean
    onChange: (checked: boolean) => void
    label?: React.ReactNode
    id?: string
    disabled?: boolean
}) {
    const fallback = useId()
    const inputId = id ?? fallback
    return (
        <label className={cx('tp-switch', disabled && 'tp-switch--disabled')} htmlFor={inputId}>
            <input
                id={inputId}
                type="checkbox"
                role="switch"
                checked={checked}
                disabled={disabled}
                onChange={event => onChange(event.target.checked)}
            />
            <span className="tp-switch__track" aria-hidden="true">
                <span className="tp-switch__thumb" />
            </span>
            {label ? <span className="tp-switch__label">{label}</span> : null}
        </label>
    )
}

const HEX = /^#[0-9a-f]{6}$/i
const SHORT_HEX = /^#[0-9a-f]{3}$/i

const expandHex = (value: string) =>
    SHORT_HEX.test(value) ? `#${value.slice(1).replace(/./g, char => char + char)}` : value

/** A swatch and a hex box, kept in step. Empty means "none" when `allowEmpty`. */
export function ColorField({
    label,
    value,
    onChange,
    allowEmpty,
    hint,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    allowEmpty?: boolean
    hint?: string
}) {
    const id = useId()
    const swatch = expandHex(value)
    return (
        <Field label={label} hint={hint} htmlFor={id}>
            <div className="tp-color">
                <span className="tp-color__swatch" style={{ background: HEX.test(swatch) ? swatch : 'transparent' }}>
                    <input
                        type="color"
                        value={HEX.test(swatch) ? swatch : '#000000'}
                        onChange={event => onChange(event.target.value)}
                        aria-label={`${label} colour picker`}
                    />
                    {!value && <span className="tp-color__none" aria-hidden="true" />}
                </span>
                <Input
                    id={id}
                    value={value}
                    onChange={event => onChange(event.target.value.trim())}
                    placeholder={allowEmpty ? 'none' : '#000000'}
                    className="tp-mono"
                    spellCheck={false}
                />
                {allowEmpty && value && (
                    <IconButton icon="x" label={`Clear ${label}`} size="sm" onClick={() => onChange('')} />
                )}
            </div>
        </Field>
    )
}

/** A row of mutually exclusive choices — alignment, preview mode. */
export function Segmented<T extends string>({
    value,
    options,
    onChange,
    label,
    size = 'md',
}: {
    value: T
    options: { value: T; label: string; icon?: IconName }[]
    onChange: (value: T) => void
    label: string
    size?: ButtonSize
}) {
    return (
        <div className={cx('tp-segmented', `tp-segmented--${size}`)} role="radiogroup" aria-label={label}>
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={option.value === value}
                    className={cx('tp-segmented__item', option.value === value && 'is-active')}
                    onClick={() => onChange(option.value)}
                >
                    {option.icon && <Icon name={option.icon} size={14} />}
                    {option.label}
                </button>
            ))}
        </div>
    )
}

/* ----------------------------------------------------------------- display */

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
    return (
        <span
            className="tp-spinner"
            style={{ width: size, height: size }}
            role={label ? 'status' : undefined}
            aria-label={label}
        />
    )
}

export function Badge({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode
    tone?: 'neutral' | 'primary' | 'positive' | 'warning' | 'critical' | 'outline'
}) {
    return <span className={cx('tp-badge', `tp-badge--${tone}`)}>{children}</span>
}

type NoticeKind = 'info' | 'warning' | 'critical' | 'positive'

const NOTICE_ICONS: Record<NoticeKind, IconName> = {
    info: 'info',
    warning: 'alert',
    critical: 'alert',
    positive: 'check',
}

/** A message box. Renders nothing at all when it has nothing to say. */
export function Notice({
    kind = 'info',
    title,
    lines,
    children,
    onDismiss,
}: {
    kind?: NoticeKind
    title?: string
    lines?: string[]
    children?: React.ReactNode
    onDismiss?: () => void
}) {
    const items = (lines ?? []).filter(Boolean)
    if (!title && !items.length && !children) return null
    return (
        <div className={cx('tp-notice', `tp-notice--${kind}`)} role={kind === 'critical' ? 'alert' : 'status'}>
            <Icon name={NOTICE_ICONS[kind]} size={16} className="tp-notice__icon" />
            <div className="tp-notice__body">
                {title && <p className="tp-notice__title">{title}</p>}
                {items.length === 1 && <p>{items[0]}</p>}
                {items.length > 1 && (
                    <ul>
                        {items.map(line => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                )}
                {children}
            </div>
            {onDismiss && <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} />}
        </div>
    )
}

export function EmptyState({
    icon,
    title,
    children,
    action,
}: {
    icon: IconName
    title: string
    children?: React.ReactNode
    action?: React.ReactNode
}) {
    return (
        <div className="tp-empty">
            <span className="tp-empty__icon">
                <Icon name={icon} size={28} />
            </span>
            <h3>{title}</h3>
            {children && <div className="tp-empty__text">{children}</div>}
            {action}
        </div>
    )
}

/** A panel with a header that opens and closes it, and a one-line summary when closed. */
export function Collapsible({
    title,
    summary,
    open,
    onToggle,
    children,
    actions,
}: {
    title: React.ReactNode
    summary?: React.ReactNode
    open: boolean
    onToggle: () => void
    children: React.ReactNode
    actions?: React.ReactNode
}) {
    const id = useId()
    return (
        <section className={cx('tp-collapsible', open && 'is-open')}>
            <div className="tp-collapsible__header">
                <button
                    type="button"
                    className="tp-collapsible__toggle"
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={onToggle}
                >
                    <Icon name="chevronRight" size={14} className="tp-collapsible__chevron" />
                    <span className="tp-collapsible__title">{title}</span>
                    {summary && <span className="tp-collapsible__summary tp-truncate">{summary}</span>}
                </button>
                {actions && <div className="tp-collapsible__actions">{actions}</div>}
            </div>
            {open && (
                <div className="tp-collapsible__body" id={id}>
                    {children}
                </div>
            )}
        </section>
    )
}

export function Card({
    children,
    className,
    title,
    actions,
}: {
    children: React.ReactNode
    className?: string
    title?: React.ReactNode
    actions?: React.ReactNode
}) {
    return (
        <section className={cx('tp-card', className)}>
            {(title || actions) && (
                <header className="tp-card__header">
                    {title && <h2 className="tp-card__title">{title}</h2>}
                    {actions && <div className="tp-row">{actions}</div>}
                </header>
            )}
            <div className="tp-card__body">{children}</div>
        </section>
    )
}
