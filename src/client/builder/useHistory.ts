import { useCallback, useRef, useState } from 'react'

const LIMIT = 100

/** Changes with the same key this close together are one step to undo: a drag, a run of typing. */
const MERGE_WINDOW = 1200

type State<T> = { past: T[]; present: T; future: T[] }

/**
 * A value with undo and redo.
 *
 * Every change is a step, except that changes carrying the same `merge` key
 * in quick succession fold into the step before them — so dragging a shape
 * across the slide, or typing a sentence into it, undoes in one go rather
 * than one pixel or one letter at a time.
 */
export function useHistory<T>(initial: T) {
    const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] })
    const last = useRef<{ key: string; at: number } | null>(null)

    const set = useCallback((next: T | ((current: T) => T), merge?: string) => {
        const now = Date.now()
        const folds = Boolean(merge && last.current?.key === merge && now - last.current.at < MERGE_WINDOW)
        last.current = merge ? { key: merge, at: now } : null
        setState(current => {
            const value = typeof next === 'function' ? (next as (current: T) => T)(current.present) : next
            if (Object.is(value, current.present)) return current
            return {
                past: folds ? current.past : [...current.past, current.present].slice(-LIMIT),
                present: value,
                future: [],
            }
        })
    }, [])

    const undo = useCallback(() => {
        last.current = null
        setState(current =>
            current.past.length
                ? {
                      past: current.past.slice(0, -1),
                      present: current.past[current.past.length - 1]!,
                      future: [current.present, ...current.future],
                  }
                : current
        )
    }, [])

    const redo = useCallback(() => {
        last.current = null
        setState(current =>
            current.future.length
                ? {
                      past: [...current.past, current.present],
                      present: current.future[0]!,
                      future: current.future.slice(1),
                  }
                : current
        )
    }, [])

    /** Starts over from a value, with nothing to undo — a presentation just opened. */
    const reset = useCallback((value: T) => {
        last.current = null
        setState({ past: [], present: value, future: [] })
    }, [])

    return {
        value: state.present,
        set,
        undo,
        redo,
        reset,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
    }
}
