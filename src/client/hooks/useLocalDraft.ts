import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearLocalDraft, readLocalDraft, writeLocalDraft, type LocalDraft } from '../data/localDrafts'

/** How long after the last change the local copy is written. */
const DELAY = 800

/**
 * Keeps the editor's unsaved work in this browser while it is unsaved, and
 * says whether there was some left over from last time.
 *
 * `key` names the record (null until there is one to name); `value` is what
 * to keep; `dirty` is whether it differs from what is saved. The left-over
 * draft is read once, when the key first arrives — `found` — and stays until
 * the editor restores it or throws it away.
 *
 * The copy names stored pictures rather than carrying them; `open` puts them
 * back (usually `openPictures` for the record) before it is offered.
 */
export function useLocalDraft<T>(
    key: string | null,
    value: T,
    dirty: boolean,
    modCount: number,
    open?: (value: T) => Promise<T>
) {
    const [found, setFound] = useState<LocalDraft<T> | null>(null)
    const read = useRef<string | null>(null)
    const opener = useRef(open)
    opener.current = open

    useEffect(() => {
        if (!key || read.current === key) return
        read.current = key
        const kept = readLocalDraft<T>(key)
        if (!kept || !opener.current) {
            setFound(kept)
            return
        }
        let live = true
        opener
            .current(kept.value)
            .then(value => live && setFound({ ...kept, value }))
            .catch(() => live && setFound(kept))
        return () => {
            live = false
        }
    }, [key])

    useEffect(() => {
        // While an old draft is waiting to be restored or dropped, it is not overwritten.
        if (!key || !dirty || found) return
        const timer = window.setTimeout(() => writeLocalDraft(key, modCount, value), DELAY)
        return () => window.clearTimeout(timer)
    }, [key, value, dirty, modCount, found])

    const dismiss = useCallback(() => {
        if (key) clearLocalDraft(key)
        setFound(null)
    }, [key])
    const clear = useCallback(() => {
        if (key) clearLocalDraft(key)
    }, [key])

    return useMemo(
        () => ({
            found,
            /** Forgets the left-over draft — restored or not — and the stored copy with it. */
            dismiss,
            /** After a save, or after choosing to discard: nothing unsaved is left to keep. */
            clear,
        }),
        [found, dismiss, clear]
    )
}
