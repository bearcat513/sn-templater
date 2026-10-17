import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> = {
    data: T | undefined
    error: string
    loading: boolean
    reload: () => void
}

/**
 * Runs a promise-returning function whenever its dependencies change, and
 * keeps only the latest answer — a slow early response cannot overwrite a
 * fast later one.
 */
export function useAsync<T>(run: () => Promise<T>, deps: unknown[], enabled = true): AsyncState<T> {
    const [data, setData] = useState<T | undefined>(undefined)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(enabled)
    const [nonce, setNonce] = useState(0)
    const ticket = useRef(0)

    useEffect(() => {
        if (!enabled) {
            setLoading(false)
            return
        }
        const mine = ++ticket.current
        setLoading(true)
        setError('')
        run()
            .then(value => mine === ticket.current && setData(value))
            .catch(failure => {
                if (mine !== ticket.current) return
                setError(failure instanceof Error ? failure.message : String(failure))
            })
            .finally(() => mine === ticket.current && setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, enabled, nonce])

    const reload = useCallback(() => setNonce(value => value + 1), [])
    return { data, error, loading, reload }
}
