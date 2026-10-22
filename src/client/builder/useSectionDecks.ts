import { useEffect, useRef, useState } from 'react'
import { loadSection, sectionSignature, type LoadedSection } from '../data/deck'
import type { SessionContext } from '../services/schema'
import { log } from '../debug/log'
import type { DeckSection } from '../engine/presentation'

/**
 * The records of the templates placed in a presentation as sections.
 *
 * Each is read as it is placed or changed — on its own, so changing one
 * section's filter reads only it — and keeps showing what it had until the
 * new records arrive. `pending` is true until every section has arrived
 * once, so nothing is arranged without them on opening.
 */
export function useSectionDecks(sections: DeckSection[] | undefined, session: SessionContext, opened: boolean) {
    const [decks, setDecks] = useState<Record<string, LoadedSection>>({})
    const loading = useRef(new Map<string, string>())

    useEffect(() => {
        for (const section of sections ?? []) {
            const signature = sectionSignature(section)
            if (decks[section.id]?.signature === signature || loading.current.get(section.id) === signature) continue
            loading.current.set(section.id, signature)
            void loadSection(section, session).then(loaded => {
                if (loading.current.get(section.id) !== signature) return
                loading.current.delete(section.id)
                if (loaded.error)
                    log.warn('builder', `Section “${section.name ?? section.template}”: ${loaded.error}`, section)
                // A section that fails to reload keeps the slides it had, with the error beside them.
                setDecks(current => ({
                    ...current,
                    [section.id]: loaded.deck ? loaded : { ...current[section.id], signature, error: loaded.error },
                }))
            })
        }
        // `decks` is read, not watched: what has arrived is not a reason to read again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sections, session])

    const ready = useRef(false)
    if (opened && !(sections ?? []).some(section => !decks[section.id])) ready.current = true

    return { decks, pending: !ready.current }
}
