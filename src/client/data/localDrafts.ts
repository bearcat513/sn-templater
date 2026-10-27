/**
 * Unsaved work, kept in this browser.
 *
 * The editors write what is on screen here a moment after each change, and
 * clear it once it is saved. If the tab closes, the browser crashes or the
 * session ends before a save, the next time the record is opened the editor
 * offers it back. It is only ever a convenience: storage can be full,
 * disabled or cleared, and every read and write here shrugs that off.
 */
import { log } from '../debug/log'
import { dropNewPictures, referPictures } from './pictures'

const PREFIX = 'templater:draft:'

export type LocalDraft<T> = {
    /** When it was kept. */
    savedAt: number
    /** The record's update counter when the editor opened it — whether the record has moved on since. */
    modCount: number
    value: T
    /**
     * Pictures added since the last save that were left out, there being no
     * room for them. Pictures already saved are kept, by name.
     */
    droppedPictures?: number
}

export function readLocalDraft<T>(key: string): LocalDraft<T> | null {
    try {
        const raw = window.localStorage.getItem(PREFIX + key)
        if (!raw) return null
        const draft = JSON.parse(raw) as LocalDraft<T>
        return typeof draft?.savedAt === 'number' && 'value' in draft ? draft : null
    } catch {
        return null
    }
}

/**
 * Keeps unsaved work. Pictures already stored as attachments are kept by
 * name (`attachment:…`), so a deck full of photographs costs no more than
 * its text; the editors open them again when the copy is restored. If even
 * that does not fit — new pictures, not yet uploaded, are still carried —
 * the copy is kept without them, and says how many it left out.
 */
export function writeLocalDraft<T>(key: string, modCount: number, value: T): void {
    const compact = referPictures(value)
    try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), modCount, value: compact }))
        return
    } catch (failure) {
        log.debug('drafts', `The local copy of ${key} did not fit with its new pictures`, failure)
    }
    const { body, dropped } = dropNewPictures(compact)
    try {
        window.localStorage.setItem(
            PREFIX + key,
            JSON.stringify({
                savedAt: Date.now(),
                modCount,
                value: body,
                ...(dropped ? { droppedPictures: dropped } : {}),
            })
        )
    } catch (failure) {
        // Full, or switched off: the work is still on screen, and saving still works.
        log.warn('drafts', `Could not keep a local copy of ${key}`, failure)
    }
}

export function clearLocalDraft(key: string): void {
    try {
        window.localStorage.removeItem(PREFIX + key)
    } catch {
        // Nothing to clear, or nothing allowed.
    }
}
