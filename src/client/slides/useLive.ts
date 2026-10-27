import { useCallback, useEffect, useRef, useState } from 'react'
import { log } from '../debug/log'
import { LiveService, type LiveState } from '../services/collaboration'

/** How often a follower asks where the presenter is. */
const POLL_MS = 2000

/**
 * Presenting with followers: once started, every move to another slide or
 * build step is written to the session, a moment later, for the people
 * following its link. Leaving the presenter ends it.
 */
export function useBroadcast(
    target: { presentation: string; presenter: string } | undefined,
    slide: string,
    step: number
) {
    const [liveId, setLiveId] = useState('')
    const [starting, setStarting] = useState(false)
    const position = useRef({ slide, step })
    position.current = { slide, step }

    const start = useCallback(async (): Promise<string> => {
        if (!target) return ''
        if (liveId) return liveId
        setStarting(true)
        try {
            const id = await LiveService.start(target.presentation, target.presenter, position.current.slide)
            setLiveId(id)
            log.info('present', 'Presenting with followers', { live: id })
            return id
        } finally {
            setStarting(false)
        }
    }, [target, liveId])

    useEffect(() => {
        if (!liveId) return
        const timer = window.setTimeout(
            () =>
                void LiveService.move(liveId, slide, step).catch(failure =>
                    log.warn('present', 'Followers could not be moved on', failure)
                ),
            150
        )
        return () => window.clearTimeout(timer)
    }, [liveId, slide, step])

    // Leaving ends the session, so followers are told rather than left waiting.
    useEffect(() => {
        if (!liveId) return
        return () => void LiveService.end(liveId).catch(() => undefined)
    }, [liveId])

    return { liveId, starting, start }
}

/** Following a live session: where its presenter is, asked for every couple of seconds. */
export function useFollow(liveId: string | null): { state: LiveState | null; error: string } {
    const [state, setState] = useState<LiveState | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!liveId) return
        let live = true
        let timer = 0
        const poll = async () => {
            try {
                const next = await LiveService.read(liveId)
                if (!live) return
                setError('')
                setState(current =>
                    current && current.slide === next.slide && current.step === next.step && current.ended === next.ended
                        ? current
                        : next
                )
                if (next.ended) return
            } catch (failure) {
                if (live) setError(failure instanceof Error ? failure.message : 'The presenter could not be reached.')
            }
            if (live) timer = window.setTimeout(() => void poll(), POLL_MS)
        }
        void poll()
        return () => {
            live = false
            window.clearTimeout(timer)
        }
    }, [liveId])

    return { state, error }
}
