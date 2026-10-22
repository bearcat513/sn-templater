import React, { useEffect, useRef, useState } from 'react'
import { SLIDE_LAYOUTS, sectionOf, type SlideLayout } from '../engine/presentation'
import type { PdfTemplate } from '../engine/template'
import type { Slide } from '../slides/paginate'
import { SlideView } from '../slides/SlideView'
import { Icon } from '../ui/icons'
import { cx } from '../ui/controls'
import { Menu } from '../ui/overlays'

const THUMB_WIDTH = 168

type Props = {
    template: PdfTemplate
    slides: Slide[]
    current: string
    onSelect: (key: string) => void
    onInsert: (at: number, layout: SlideLayout) => void
    onMove: (from: number, to: number) => void
    onHide: (key: string, hidden: boolean) => void
    onDuplicate: (key: string) => void
    onDelete: (key: string) => void
    /** Place a template at this gap, as a section of its own. */
    onInsertSection: (at: number) => void
    /** A section, header and slides together, moved to the gap before `gap`. */
    onMoveSection: (id: string, gap: number) => void
    onHideSection: (id: string, hidden: boolean) => void
    onRemoveSection: (id: string) => void
}

/**
 * The slides in their running order, as thumbnails — PowerPoint's left rail.
 *
 * Drag one to move it; the gap it would land in is marked. Between any two
 * slides, and after the last, a + slots a new custom slide in. Record slides
 * can be moved and hidden but not deleted or edited here: they are the
 * template's, drawn again from the records each time.
 *
 * A template placed in the deck is a section: a header over its slides,
 * which drags them all along with it.
 */
export function SlideSorter({
    template,
    slides,
    current,
    onSelect,
    onInsert,
    onMove,
    onHide,
    onDuplicate,
    onDelete,
    onInsertSection,
    onMoveSection,
    onHideSection,
    onRemoveSection,
}: Props) {
    const [dragging, setDragging] = useState<number | null>(null)
    const [target, setTarget] = useState<number | null>(null)
    const [announcement, setAnnouncement] = useState('')
    const list = useRef<HTMLOListElement>(null)

    /** Puts focus back on a slide's button after it moved, once the list has redrawn. */
    const refocus = (key: string, selector: string) =>
        requestAnimationFrame(() =>
            list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] ${selector}`)?.focus()
        )

    /** Alt+Up and Alt+Down move the focused slide or section, as dragging would. */
    const onMoveKey = (event: React.KeyboardEvent, index: number) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        event.preventDefault()
        event.stopPropagation()
        const slide = slides[index]
        if (!slide) return
        const up = event.key === 'ArrowUp'
        if (slide.marker) {
            const id = slide.marker.id
            const last = slides.reduce((at, other, position) => (sectionOf(other.key) === id ? position : at), index)
            // The gap before the slide above, or after the slide below the section.
            const gap = up ? index - 1 : last + 2
            if (gap < 0 || gap > slides.length) return
            onMoveSection(id, gap)
            setAnnouncement(`Moved section ${slide.label} ${up ? 'up' : 'down'}.`)
            refocus(slide.key, '.tp-sorter__section-head')
            return
        }
        const to = up ? index - 1 : index + 1
        if (to < 0 || to >= slides.length) return
        onMove(index, to)
        setAnnouncement(`Moved ${slide.label} to position ${to + 1} of ${slides.length}.`)
        refocus(slide.key, '.tp-sorter__thumb')
    }
    let shownNumber = 0

    // Keep the current slide in view when it changes from elsewhere — the keyboard, a new slide.
    useEffect(() => {
        list.current
            ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(current)}"]`)
            ?.scrollIntoView({ block: 'nearest' })
    }, [current])

    const drop = () => {
        const marker = dragging !== null ? slides[dragging]?.marker : undefined
        if (marker && target !== null) {
            const inside =
                sectionOf(slides[target - 1]?.key ?? '') === marker.id &&
                sectionOf(slides[target]?.key ?? '') === marker.id
            if (!inside) onMoveSection(marker.id, target)
        } else if (dragging !== null && target !== null && target !== dragging && target !== dragging + 1) {
            onMove(dragging, target > dragging ? target - 1 : target)
        }
        setDragging(null)
        setTarget(null)
    }

    return (
        <>
            <p className="tp-sr-only" aria-live="polite">
                {announcement}
            </p>
            <ol className="tp-sorter" ref={list} aria-label="Slides" aria-describedby="tp-sorter-help">
                {slides.map((slide, index) => {
                    const marker = slide.marker
                    if (marker) {
                        const own = slides.filter(other => !other.marker && sectionOf(other.key) === marker.id)
                        const allHidden = own.length > 0 && own.every(other => other.hidden)
                        const last = slides.reduce(
                            (at, other, position) => (sectionOf(other.key) === marker.id ? position : at),
                            index
                        )
                        return (
                            <React.Fragment key={slide.key}>
                                <Gap
                                    index={index}
                                    target={target}
                                    onInsert={onInsert}
                                    onInsertSection={onInsertSection}
                                />
                                <li
                                    data-key={slide.key}
                                    className={cx(
                                        'tp-sorter__section',
                                        slide.key === current && 'is-current',
                                        dragging === index && 'is-dragging'
                                    )}
                                    draggable
                                    onDragStart={event => {
                                        event.dataTransfer.effectAllowed = 'move'
                                        event.dataTransfer.setData('text/plain', slide.key)
                                        setDragging(index)
                                    }}
                                    onDragOver={event => {
                                        if (dragging === null) return
                                        event.preventDefault()
                                        const rect = event.currentTarget.getBoundingClientRect()
                                        setTarget(event.clientY < rect.top + rect.height / 2 ? index : index + 1)
                                    }}
                                    onDrop={event => {
                                        event.preventDefault()
                                        drop()
                                    }}
                                    onDragEnd={() => {
                                        setDragging(null)
                                        setTarget(null)
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="tp-sorter__section-head"
                                        onClick={() => onSelect(slide.key)}
                                        onKeyDown={event => onMoveKey(event, index)}
                                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                        aria-current={slide.key === current ? 'true' : undefined}
                                        aria-label={`Section: ${slide.label}, ${own.length} slide${own.length === 1 ? '' : 's'}`}
                                    >
                                        <Icon name="layers" size={12} />
                                        <span className="tp-truncate">{slide.label}</span>
                                        <span className="tp-sorter__section-count">{own.length}</span>
                                    </button>
                                    <div className="tp-sorter__menu">
                                        <Menu
                                            label={`Section actions: ${slide.label}`}
                                            items={[
                                                {
                                                    label: 'Move section up',
                                                    icon: 'chevronUp',
                                                    disabled: index === 0,
                                                    onSelect: () => onMoveSection(marker.id, index - 1),
                                                },
                                                {
                                                    label: 'Move section down',
                                                    icon: 'chevronDown',
                                                    disabled: last >= slides.length - 1,
                                                    onSelect: () => onMoveSection(marker.id, last + 2),
                                                },
                                                {
                                                    label: allHidden ? 'Show its slides' : 'Hide its slides',
                                                    icon: allHidden ? 'eye' : 'eyeOff',
                                                    disabled: !own.length,
                                                    onSelect: () => onHideSection(marker.id, !allHidden),
                                                },
                                                {
                                                    label: 'Remove section',
                                                    icon: 'trash',
                                                    danger: true,
                                                    onSelect: () => onRemoveSection(marker.id),
                                                },
                                            ]}
                                        />
                                    </div>
                                </li>
                            </React.Fragment>
                        )
                    }
                    if (!slide.hidden) shownNumber++
                    const custom = Boolean(slide.custom)
                    return (
                        <React.Fragment key={slide.key}>
                            <Gap index={index} target={target} onInsert={onInsert} onInsertSection={onInsertSection} />
                            <li
                                data-key={slide.key}
                                className={cx(
                                    'tp-sorter__item',
                                    sectionOf(slide.key) !== null && 'in-section',
                                    slide.key === current && 'is-current',
                                    slide.hidden && 'is-hidden',
                                    dragging === index && 'is-dragging'
                                )}
                                draggable
                                onDragStart={event => {
                                    event.dataTransfer.effectAllowed = 'move'
                                    event.dataTransfer.setData('text/plain', slide.key)
                                    setDragging(index)
                                }}
                                onDragOver={event => {
                                    if (dragging === null) return
                                    event.preventDefault()
                                    const rect = event.currentTarget.getBoundingClientRect()
                                    setTarget(event.clientY < rect.top + rect.height / 2 ? index : index + 1)
                                }}
                                onDrop={event => {
                                    event.preventDefault()
                                    drop()
                                }}
                                onDragEnd={() => {
                                    setDragging(null)
                                    setTarget(null)
                                }}
                            >
                                <span className="tp-sorter__number" aria-hidden="true">
                                    {slide.hidden ? <Icon name="eyeOff" size={12} /> : shownNumber}
                                </span>
                                <button
                                    type="button"
                                    className="tp-sorter__thumb"
                                    onClick={() => onSelect(slide.key)}
                                    onKeyDown={event => onMoveKey(event, index)}
                                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                                    aria-current={slide.key === current ? 'true' : undefined}
                                    aria-label={`${slide.hidden ? 'Hidden slide' : `Slide ${shownNumber}`}: ${slide.label}`}
                                >
                                    <Thumb template={template} slide={slide} />
                                    <span className="tp-sorter__label">
                                        <Icon
                                            name={custom ? 'type' : slide.owner === -1 ? 'slides' : 'file'}
                                            size={11}
                                        />
                                        <span className="tp-truncate">
                                            {slide.label}
                                            {slide.parts > 1 ? ` (${slide.part}/${slide.parts})` : ''}
                                        </span>
                                    </span>
                                </button>
                                <div className="tp-sorter__menu">
                                    <Menu
                                        label={`Slide actions: ${slide.label}`}
                                        items={[
                                            {
                                                label: 'Move up',
                                                icon: 'chevronUp',
                                                disabled: index === 0,
                                                onSelect: () => onMove(index, index - 1),
                                            },
                                            {
                                                label: 'Move down',
                                                icon: 'chevronDown',
                                                disabled: index === slides.length - 1,
                                                onSelect: () => onMove(index, index + 1),
                                            },
                                            {
                                                label: slide.hidden ? 'Show slide' : 'Hide slide',
                                                icon: slide.hidden ? 'eye' : 'eyeOff',
                                                onSelect: () => onHide(slide.key, !slide.hidden),
                                            },
                                            ...(custom
                                                ? [
                                                      {
                                                          label: 'Duplicate',
                                                          icon: 'copy' as const,
                                                          onSelect: () => onDuplicate(slide.key),
                                                      },
                                                      {
                                                          label: 'Delete slide',
                                                          icon: 'trash' as const,
                                                          danger: true,
                                                          onSelect: () => onDelete(slide.key),
                                                      },
                                                  ]
                                                : []),
                                        ]}
                                    />
                                </div>
                            </li>
                        </React.Fragment>
                    )
                })}
                <Gap index={slides.length} target={target} onInsert={onInsert} onInsertSection={onInsertSection} last />
            </ol>
            <p id="tp-sorter-help" className="tp-sr-only">
                Alt+Up and Alt+Down move the focused slide or section.
            </p>
        </>
    )
}

/**
 * A thumbnail, drawn again only when its slide changed: dragging a shape
 * redraws that slide's thumbnail, not the other forty. Record slides keep
 * their blocks and rows between arrangements, so identity says enough.
 */
const Thumb = React.memo(
    function Thumb({ template, slide }: { template: PdfTemplate; slide: Slide }) {
        return <SlideView template={template} slide={slide} width={THUMB_WIDTH} />
    },
    (before, after) =>
        before.template === after.template &&
        before.slide.key === after.slide.key &&
        before.slide.custom === after.slide.custom &&
        before.slide.blocks === after.slide.blocks &&
        before.slide.related === after.slide.related &&
        before.slide.values['slide.number'] === after.slide.values['slide.number'] &&
        before.slide.values['slide.count'] === after.slide.values['slide.count'] &&
        before.slide.values['deck.title'] === after.slide.values['deck.title']
)

/** The space between two slides: where a dragged slide would land, and where a new one can be slotted in. */
function Gap({
    index,
    target,
    onInsert,
    onInsertSection,
    last,
}: {
    index: number
    target: number | null
    onInsert: (at: number, layout: SlideLayout) => void
    onInsertSection: (at: number) => void
    last?: boolean
}) {
    return (
        <li className={cx('tp-sorter__gap', target === index && 'is-target', last && 'tp-sorter__gap--last')}>
            <Menu
                label={last ? 'Add a slide at the end' : 'Insert a slide here'}
                icon="plus"
                align="start"
                items={[
                    ...SLIDE_LAYOUTS.map(({ layout, label }) => ({ label, onSelect: () => onInsert(index, layout) })),
                    { label: 'A template’s slides…', icon: 'layers' as const, onSelect: () => onInsertSection(index) },
                ]}
            />
        </li>
    )
}
