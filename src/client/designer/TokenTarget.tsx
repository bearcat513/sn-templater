import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { Input, Textarea } from '../ui/controls'

/**
 * Where a clicked token goes.
 *
 * Every text box in the designer that can hold tokens registers itself here
 * when it gets focus. Clicking a token in the token panel then inserts it at
 * that box's caret — nobody should have to transcribe
 * `{{record.assignment_group.manager.email}}` by hand.
 */
type Target = { insert: (text: string) => void; element: HTMLElement }

type TokenTargetApi = {
    register: (target: Target) => void
    unregister: (element: HTMLElement) => void
    /** Inserts into the last focused box. False when there is none. */
    insert: (text: string) => boolean
}

const TokenTargetContext = createContext<TokenTargetApi>({
    register: () => {},
    unregister: () => {},
    insert: () => false,
})

export const useTokenTarget = () => useContext(TokenTargetContext)

export function TokenTargetProvider({ children }: { children: React.ReactNode }) {
    const current = useRef<Target | null>(null)

    const api = useMemo<TokenTargetApi>(
        () => ({
            register: target => {
                current.current = target
            },
            unregister: element => {
                if (current.current?.element === element) current.current = null
            },
            insert: text => {
                if (!current.current || !document.body.contains(current.current.element)) return false
                current.current.insert(text)
                return true
            },
        }),
        []
    )

    return <TokenTargetContext.Provider value={api}>{children}</TokenTargetContext.Provider>
}

type TokenFieldProps = {
    value: string
    onChange: (value: string) => void
    multiline?: boolean
    rows?: number
    placeholder?: string
    id?: string
    className?: string
    'aria-label'?: string
    maxLength?: number
}

/** A text box (or area) that tokens from the token panel can be dropped into. */
export function TokenField({ value, onChange, multiline, rows = 3, ...rest }: TokenFieldProps) {
    const { register, unregister } = useTokenTarget()
    const element = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
    const latest = useRef({ value, onChange })
    latest.current = { value, onChange }

    const onFocus = useCallback(() => {
        const node = element.current
        if (!node) return
        register({
            element: node,
            insert: text => {
                const { value: current, onChange: change } = latest.current
                const start = node.selectionStart ?? current.length
                const end = node.selectionEnd ?? current.length
                change(current.slice(0, start) + text + current.slice(end))
                requestAnimationFrame(() => {
                    node.focus()
                    node.setSelectionRange(start + text.length, start + text.length)
                })
            },
        })
    }, [register])

    useEffect(() => {
        const node = element.current
        return () => {
            if (node) unregister(node)
        }
    }, [unregister])

    return multiline ? (
        <Textarea
            ref={element}
            value={value}
            rows={rows}
            onFocus={onFocus}
            onChange={event => onChange(event.target.value)}
            spellCheck={false}
            {...rest}
        />
    ) : (
        <Input
            ref={element}
            value={value}
            onFocus={onFocus}
            onChange={event => onChange(event.target.value)}
            spellCheck={false}
            {...rest}
        />
    )
}
