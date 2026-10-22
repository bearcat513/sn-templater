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

const PREFIX = 'templater:draft:'

export type LocalDraft<T> = {
    /** When it was kept. */
    savedAt: number
    /** The record's update counter when the editor opened it — whether the record has moved on since. */
    modCount: number
    value: T
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

export function writeLocalDraft<T>(key: string, modCount: number, value: T): void {
    try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), modCount, value }))
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
