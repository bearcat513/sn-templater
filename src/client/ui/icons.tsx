import React from 'react'

/**
 * A small inline icon set: 24px grid, 2px strokes, `currentColor`.
 *
 * Inline rather than a font or a sprite so nothing has to load, and stroked
 * rather than filled so they sit at the same visual weight as the text.
 */
const PATHS = {
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    chevronUp: 'M6 15l6-6 6 6',
    chevronDown: 'M6 9l6 6 6-6',
    chevronLeft: 'M15 6l-6 6 6 6',
    chevronRight: 'M9 6l6 6-6 6',
    arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12l5 5L20 7',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
    slides: 'M3 5h18v12H3zM8 21h8M12 17v4',
    copy: 'M9 9h10v12H9zM5 15V3h10',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    play: 'M7 4l13 8-13 8z',
    maximize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    minimize: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    settings:
        'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 3v5h7V3M8 21v-7h8v7',
    refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 1 0 0-.01',
    alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.01',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
    braces: 'M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    paperclip: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    filter: 'M4 5h16l-6 8v6l-4-2v-4z',
    table: 'M4 5h16v14H4zM4 10h16M10 10v9',
    chart: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
    bug: 'M9 7a3 3 0 0 1 6 0v1H9zM7 9h10v5a5 5 0 0 1-10 0zM12 10v9M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 19l3-2M20 19l-3-2',
    ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
    eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    type: 'M5 7V5h14v2M12 5v14M9 19h6',
    square: 'M5 5h14v14H5z',
    circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
    triangle: 'M12 4l9 16H3z',
    line: 'M5 19L19 5',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    textLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
    textCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
    textRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    alignLeft: 'M4 4v16M8 7h10v4H8zM8 14h6v4H8z',
    alignCenter: 'M12 3v18M7 7h10v4H7zM9 14h6v4H9z',
    alignRight: 'M20 4v16M6 7h10v4H6zM10 14h6v4h-6z',
    alignTop: 'M4 4h16M7 8h4v10H7zM14 8h4v6h-4z',
    alignMiddle: 'M3 12h18M7 7h4v10H7zM14 9h4v6h-4z',
    alignBottom: 'M4 20h16M7 6h4v10H7zM14 10h4v6h-4z',
    distributeH: 'M4 4v16M20 4v16M10 8h4v8h-4z',
    distributeV: 'M4 4h16M4 20h16M8 10h8v4H8z',
    bringForward: 'M9 9h11v11H9zM4 15V4h11',
    sendBackward: 'M4 4h11v11H4zM20 9v11H9',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    diamond: 'M12 3l9 9-9 9-9-9z',
    hexagon: 'M7.5 4h9l4.5 8-4.5 8h-9L3 12z',
    star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z',
    rotate: 'M20 11a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    brush: 'M14 4l6 6-8 8H6v-6zM4 20l2-2',
    notes: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
    animation: 'M4 12h3M9 7l2 2M12 4v3M15 9l2-2M13 13l7 7M13 13l-1 5-3-3-5-1z',
    transition: 'M4 6h8v12H4zM16 6h4v12h-4M12 12h4',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
    name,
    size = 16,
    className,
    title,
}: {
    name: IconName
    size?: number
    className?: string
    title?: string
}) {
    return (
        <svg
            className={`tp-icon${className ? ` ${className}` : ''}`}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
        >
            {title && <title>{title}</title>}
            <path d={PATHS[name]} />
        </svg>
    )
}
