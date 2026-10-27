import { useCallback, useReducer } from 'react'

const LIMIT = 100

/** Changes with the same key this close together are one step to undo: a drag, a run of typing. */
export const MERGE_WINDOW = 1200

export type HistoryState<T> = {
    past: T[]
    present: T
    future: T[]
    /** The last change's merge key and when it was made, for folding the next one into it. */
    last: { key: string; at: number } | null
}

export type HistoryAction<T> =
    | { type: 'set'; next: T | ((current: T) => T); merge?: string; at: number }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'reset'; value: T }

export const startHistory = <T>(value: T): HistoryState<T> => ({ past: [], present: value, future: [], last: null })

/**
 * Undo and redo, as a pure reducer.
 *
 * Every change is a step, except that changes carrying the same `merge` key
 * in quick succession fold into the step before them — so dragging a shape
 * across the slide, or typing a sentence into it, undoes in one go rather
 * than one pixel or one letter at a time. A change that hands back the very
 * same value is no step at all.
 */
export function historyReducer<T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> {
    switch (action.type) {
        case 'set': {
            const value =
                typeof action.next === 'function' ? (action.next as (current: T) => T)(state.present) : action.next
            const folds = Boolean(
                action.merge && state.last?.key === action.merge && action.at - state.last.at < MERGE_WINDOW
            )
            const last = action.merge ? { key: action.merge, at: action.at } : null
            if (Object.is(value, state.present)) return state.last === last ? state : { ...state, last }
            return {
                past: folds ? state.past : [...state.past, state.present].slice(-LIMIT),
                present: value,
                future: [],
                last,
            }
        }
        case 'undo':
            return state.past.length
                ? {
                      past: state.past.slice(0, -1),
                      present: state.past[state.past.length - 1]!,
                      future: [state.present, ...state.future],
                      last: null,
                  }
                : state
        case 'redo':
            return state.future.length
                ? {
                      past: [...state.past, state.present],
                      present: state.future[0]!,
                      future: state.future.slice(1),
                      last: null,
                  }
                : state
        case 'reset':
            return startHistory(action.value)
    }
}

/** A value with undo and redo: `historyReducer` in a component. */
export function useHistory<T>(initial: T) {
    const [state, dispatch] = useReducer(
        historyReducer as (state: HistoryState<T>, action: HistoryAction<T>) => HistoryState<T>,
        initial,
        startHistory
    )

    const set = useCallback(
        (next: T | ((current: T) => T), merge?: string) => dispatch({ type: 'set', next, merge, at: Date.now() }),
        []
    )
    const undo = useCallback(() => dispatch({ type: 'undo' }), [])
    const redo = useCallback(() => dispatch({ type: 'redo' }), [])
    /** Starts over from a value, with nothing to undo — a presentation just opened. */
    const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), [])

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
