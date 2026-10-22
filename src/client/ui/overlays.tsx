import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './icons'
import { Button, IconButton, cx } from './controls'
import { log } from '../debug/log'

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* ------------------------------------------------------------------- modal */

/**
 * A dialog: focus moves in when it opens, stays in while it is open, and goes
 * back where it came from when it closes. Escape and the backdrop close it.
 */
export function Modal({
    open,
    title,
    children,
    footer,
    onClose,
    size = 'md',
}: {
    open: boolean
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
    onClose: () => void
    size?: 'sm' | 'md' | 'lg'
}) {
    const panel = useRef<HTMLDivElement>(null)
    const titleId = useId()

    useEffect(() => {
        if (!open) return
        const previous = document.activeElement as HTMLElement | null
        const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
        ;(first ?? panel.current)?.focus()

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                onClose()
                return
            }
            if (event.key !== 'Tab' || !panel.current) return
            const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
            if (!items.length) return
            const firstItem = items[0]!
            const lastItem = items[items.length - 1]!
            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault()
                lastItem.focus()
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault()
                firstItem.focus()
            }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
            document.removeEventListener('keydown', onKey, true)
            previous?.focus?.()
        }
    }, [open, onClose])

    if (!open) return null

    return createPortal(
        <div className="tp-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <div
                ref={panel}
                className={cx('tp-modal', `tp-modal--${size}`)}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <header className="tp-modal__header">
                    <h2 id={titleId}>{title}</h2>
                    <IconButton icon="x" label="Close" onClick={onClose} />
                </header>
                <div className="tp-modal__body">{children}</div>
                {footer && <footer className="tp-modal__footer">{footer}</footer>}
            </div>
        </div>,
        document.body
    )
}

/** "Are you sure?" with the answer on the button rather than in an OK. */
export function ConfirmModal({
    open,
    title,
    message,
    confirmLabel,
    danger,
    onConfirm,
    onCancel,
}: {
    open: boolean
    title: string
    message: React.ReactNode
    confirmLabel: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    return (
        <Modal
            open={open}
            title={title}
            onClose={onCancel}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="tp-muted">{message}</div>
        </Modal>
    )
}

/* -------------------------------------------------------------------- menu */

export type MenuItem = {
    label: string
    icon?: IconName
    onSelect: () => void
    danger?: boolean
    disabled?: boolean
}

/** A button that opens a short list of actions. Arrow keys move, Escape closes. */
export function Menu({
    label,
    icon = 'more',
    items,
    buttonLabel,
    align = 'end',
}: {
    label: string
    icon?: IconName
    items: MenuItem[]
    buttonLabel?: string
    align?: 'start' | 'end'
}) {
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const list = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
        const onDown = (event: MouseEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (!list.current) return
        const entries = [...list.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')]
        const at = entries.indexOf(document.activeElement as HTMLElement)
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            entries[(at + 1) % entries.length]?.focus()
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            entries[(at - 1 + entries.length) % entries.length]?.focus()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            root.current?.querySelector<HTMLElement>('button')?.focus()
        }
    }

    return (
        <div className="tp-menu" ref={root}>
            {buttonLabel ? (
                <Button
                    icon={icon}
                    iconAfter="chevronDown"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                >
                    {buttonLabel}
                </Button>
            ) : (
                <IconButton
                    icon={icon}
                    label={label}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                />
            )}
            {open && (
                <div
                    className={cx('tp-menu__list', `tp-menu__list--${align}`)}
                    role="menu"
                    aria-label={label}
                    ref={list}
                    onKeyDown={onKeyDown}
                >
                    {items.map(item => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            className={cx('tp-menu__item', item.danger && 'tp-menu__item--danger')}
                            onClick={() => {
                                setOpen(false)
                                item.onSelect()
                            }}
                        >
                            {item.icon && <Icon name={item.icon} size={14} />}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ toasts */

type Toast = { id: number; message: string; tone: 'positive' | 'critical' | 'info' }

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const next = useRef(1)

    const push = useCallback((message: string, tone: Toast['tone'] = 'positive') => {
        const id = next.current++
        if (tone === 'critical') log.error('toast', message)
        else log.info('toast', message)
        setToasts(current => [...current.slice(-3), { id, message, tone }])
        window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 4500)
    }, [])

    return (
        <ToastContext.Provider value={push}>
            {children}
            <div className="tp-toasts" aria-live="polite">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={cx('tp-toast', `tp-toast--${toast.tone}`)}
                        // A failure interrupts; anything else waits its turn.
                        role={toast.tone === 'critical' ? 'alert' : 'status'}
                    >
                        <Icon name={toast.tone === 'critical' ? 'alert' : toast.tone === 'info' ? 'info' : 'check'} />
                        <span>{toast.message}</span>
                        <IconButton
                            icon="x"
                            label="Dismiss"
                            size="sm"
                            onClick={() => setToasts(current => current.filter(entry => entry.id !== toast.id))}
                        />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
