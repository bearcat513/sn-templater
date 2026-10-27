import {
    applyTransitionToAll,
    withSlideOptions,
    type CustomSlide,
    type DeckSection,
    type PresentationBody,
    type SlideOptions,
    type Transition,
} from '../engine/presentation'
import type { Slide } from '../slides/paginate'
import {
    deleteSlide,
    hideSection,
    insertSection,
    insertSlide,
    moveSection,
    moveSlide,
    removeSection,
    setHidden,
    updateSection,
    updateSlide,
} from './operations'

/**
 * Everything the slide builder does to a presentation's body, as actions.
 *
 * Each is one of the pure operations in ./operations.ts, named, so the
 * builder says what it is doing (`{ type: 'moveSlide', from, to }`) rather
 * than handing the undo history a closure, and a run of actions can be
 * replayed — and undone — in a test. Actions that place slides carry the
 * slides as they were arranged when the action was taken: the running order
 * is written out from them.
 */
export type BodyAction =
    | { type: 'insertSlide'; slides: Slide[]; at: number; slide: CustomSlide }
    | { type: 'moveSlide'; slides: Slide[]; from: number; to: number }
    | { type: 'setHidden'; slides: Slide[]; key: string; hidden: boolean }
    | { type: 'deleteSlide'; slides: Slide[]; key: string }
    | { type: 'updateSlide'; id: string; change: (slide: CustomSlide) => CustomSlide }
    | { type: 'insertSection'; slides: Slide[]; at: number; section: DeckSection }
    | { type: 'updateSection'; id: string; change: Partial<DeckSection> }
    | { type: 'removeSection'; slides: Slide[]; id: string }
    | { type: 'moveSection'; slides: Slide[]; id: string; gap: number }
    | { type: 'hideSection'; slides: Slide[]; id: string; hidden: boolean }
    | { type: 'slideOptions'; key: string; change: Partial<SlideOptions> }
    | { type: 'transitionAll'; transition: Transition }
    /** A body from elsewhere: a duplicated slide, a draft kept in the browser, a version restored. */
    | { type: 'replace'; body: PresentationBody }

export function reduceBody(body: PresentationBody, action: BodyAction): PresentationBody {
    switch (action.type) {
        case 'insertSlide':
            return insertSlide(body, action.slides, action.at, action.slide)
        case 'moveSlide':
            return moveSlide(body, action.slides, action.from, action.to)
        case 'setHidden':
            return setHidden(body, action.slides, action.key, action.hidden)
        case 'deleteSlide':
            return deleteSlide(body, action.slides, action.key)
        case 'updateSlide':
            return updateSlide(body, action.id, action.change)
        case 'insertSection':
            return insertSection(body, action.slides, action.at, action.section)
        case 'updateSection':
            return updateSection(body, action.id, action.change)
        case 'removeSection':
            return removeSection(body, action.slides, action.id)
        case 'moveSection':
            return moveSection(body, action.slides, action.id, action.gap)
        case 'hideSection':
            return hideSection(body, action.slides, action.id, action.hidden)
        case 'slideOptions':
            return withSlideOptions(body, action.key, action.change)
        case 'transitionAll':
            return applyTransitionToAll(body, action.transition)
        case 'replace':
            return action.body
    }
}
