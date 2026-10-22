import React, { useRef } from 'react'
import { useElementSize } from '../hooks/useElementSize'

/**
 * The middle of the builder, measured: the slide drawn as large as fits.
 * Its own component so the measuring starts when it appears, which is after
 * the deck has loaded rather than when the view does.
 */
export function Fit({ aspect, children }: { aspect: number; children: (width: number) => React.ReactNode }) {
    const area = useRef<HTMLDivElement>(null)
    const size = useElementSize(area)
    const width = Math.max(200, Math.floor(Math.min(size.width - 48, (size.height - 48) * aspect)))
    return (
        <div className="tp-builder__canvas" ref={area}>
            {size.width > 0 ? children(width) : null}
        </div>
    )
}
