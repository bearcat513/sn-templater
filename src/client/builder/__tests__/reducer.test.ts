import { describe, expect, it } from 'vitest'
import { EMPTY_BODY, customKey, type CustomSlide, type PresentationBody } from '../../engine/presentation'
import type { Slide } from '../../slides/paginate'
import { reduceBody, type BodyAction } from '../reducer'
import { MERGE_WINDOW, historyReducer, startHistory, type HistoryState } from '../useHistory'

const slide = (id: string): CustomSlide => ({ id, elements: [] })

/** The slides as the builder would have arranged them: one per custom slide, in the body's order. */
const arranged = (body: PresentationBody): Slide[] =>
    body.order.map(entry => ({
        key: entry.key,
        hidden: entry.hidden,
        owner: -2,
        blocks: [],
        values: {},
        related: {},
        label: entry.key,
        part: 1,
        parts: 1,
    }))

/** Applies actions one after another, each against the slides as they are at that point. */
function play(actions: ((body: PresentationBody) => BodyAction)[]): HistoryState<PresentationBody> {
    let state = startHistory<PresentationBody>(EMPTY_BODY)
    actions.forEach((make, index) => {
        state = historyReducer(state, {
            type: 'set',
            next: body => reduceBody(body, make(body)),
            at: index * MERGE_WINDOW * 2,
        })
    })
    return state
}

describe('reduceBody', () => {
    it('inserts, moves, hides and deletes custom slides through the running order', () => {
        const state = play([
            body => ({ type: 'insertSlide', slides: arranged(body), at: 0, slide: slide('a') }),
            body => ({ type: 'insertSlide', slides: arranged(body), at: 1, slide: slide('b') }),
            body => ({ type: 'moveSlide', slides: arranged(body), from: 1, to: 0 }),
            body => ({ type: 'setHidden', slides: arranged(body), key: customKey('a'), hidden: true }),
        ])
        expect(state.present.order).toEqual([{ key: 'custom:b' }, { key: 'custom:a', hidden: true }])
        const deleted = reduceBody(state.present, {
            type: 'deleteSlide',
            slides: arranged(state.present),
            key: 'custom:b',
        })
        expect(deleted.slides.map(entry => entry.id)).toEqual(['a'])
        expect(deleted.order).toEqual([{ key: 'custom:a', hidden: true }])
    })

    it('sets slide notes and a transition for every slide', () => {
        const noted = reduceBody(EMPTY_BODY, { type: 'slideOptions', key: 'cover:1', change: { notes: 'Hi' } })
        expect(noted.options).toEqual({ 'cover:1': { notes: 'Hi' } })
        expect(reduceBody(noted, { type: 'transitionAll', transition: 'push' }).transition).toBe('push')
    })
})

describe('historyReducer', () => {
    it('undoes and redoes a run of actions one step at a time', () => {
        let state = play([
            body => ({ type: 'insertSlide', slides: arranged(body), at: 0, slide: slide('a') }),
            body => ({ type: 'insertSlide', slides: arranged(body), at: 1, slide: slide('b') }),
        ])
        state = historyReducer(state, { type: 'undo' })
        expect(state.present.slides.map(entry => entry.id)).toEqual(['a'])
        state = historyReducer(state, { type: 'undo' })
        expect(state.present).toBe(EMPTY_BODY)
        expect(historyReducer(state, { type: 'undo' })).toBe(state)
        state = historyReducer(historyReducer(state, { type: 'redo' }), { type: 'redo' })
        expect(state.present.slides.map(entry => entry.id)).toEqual(['a', 'b'])
    })

    it('folds changes with the same merge key made close together into one step', () => {
        const type = (state: HistoryState<string>, value: string, at: number) =>
            historyReducer(state, { type: 'set', next: value, merge: 'notes', at })
        let state = startHistory('')
        state = type(state, 'H', 0)
        state = type(state, 'Hi', 100)
        state = type(state, 'Hi!', 200)
        expect(state.past).toEqual([''])
        state = type(state, 'Hi! Later', 200 + MERGE_WINDOW + 1)
        expect(state.past).toEqual(['', 'Hi!'])
    })

    it('makes no step for a change that hands back the same value, and a new change clears redo', () => {
        let state = historyReducer(startHistory(1), { type: 'set', next: 2, at: 0 })
        expect(historyReducer(state, { type: 'set', next: current => current, at: 1 }).past).toEqual([1])
        state = historyReducer(state, { type: 'undo' })
        state = historyReducer(state, { type: 'set', next: 3, at: 2 })
        expect(state.future).toEqual([])
        expect(historyReducer(state, { type: 'reset', value: 9 })).toEqual(startHistory(9))
    })
})
