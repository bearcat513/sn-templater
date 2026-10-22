import type { DeckSource } from '../data/deck'
import type { PresentationBody } from '../engine/presentation'

/** What a presentation is besides its slides: its name and where its records come from. */
export type Meta = DeckSource & { name: string }

/**
 * What was last saved, to tell whether there is anything to save. The body is
 * compared by identity — the undo history hands back the very object that
 * was saved, so undoing to it is clean — which keeps a drag from serializing
 * every picture on the slide sixty times a second.
 */
export type Saved = { meta: string; body: PresentationBody }
export const savedAs = (meta: Meta | null, body: PresentationBody): Saved => ({ meta: JSON.stringify(meta), body })
