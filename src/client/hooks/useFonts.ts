import { useEffect, useState } from 'react'
import { log } from '../debug/log'
import { loadUnicodeFonts, unicodeFontsReady } from '../engine/fonts'
import { needsUnicode } from '../engine/pdfFonts'

/**
 * Loads the embedded fonts when what is about to be rendered needs them —
 * text the standard PDF fonts cannot set — and not otherwise. Await it before
 * a render; renders themselves are synchronous.
 */
export async function prepareFonts(...values: unknown[]): Promise<void> {
    if (unicodeFontsReady() || !needsUnicode(...values)) return
    const done = log.time('render', 'Embedded fonts loaded')
    await loadUnicodeFonts()
    done()
}

/**
 * For a render that happens as part of rendering a component — a live
 * preview — the same thing as a hook: true once the fonts it needs, if any,
 * are ready. Put it among the render's dependencies, so the preview is drawn
 * again with the real glyphs once they arrive.
 */
export function useFontsReady(...values: unknown[]): boolean {
    const needed = !unicodeFontsReady() && needsUnicode(...values)
    const [, setLoaded] = useState(0)
    useEffect(() => {
        if (!needed) return
        let live = true
        prepareFonts(...values).then(
            () => live && setLoaded(count => count + 1),
            failure => log.warn('render', 'The embedded fonts could not be loaded', failure)
        )
        return () => {
            live = false
        }
        // `needed` is the only thing that decides whether to load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needed])
    return !needed
}
