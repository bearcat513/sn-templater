import React, { useEffect, useRef, useState } from 'react'
import { SLIDE_LAYOUTS, type SlideLayout } from '../engine/presentation'
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
}

/**
 * The slides in their running order, as thumbnails — PowerPoint's left rail.
 *
 * Drag one to move it; the gap it would land in is marked. Between any two
 * slides, and after the last, a + slots a new custom slide in. Record slides
 * can be moved and hidden but not deleted or edited here: they are the
 * template's, drawn again from the records each time.
 */
export function SlideSorter({ template, slides, current, onSelect, onInsert, onMove, onHide, onDuplicate, onDelete }: Props) {
    const [dragging, setDragging] = useState<number | null>(null)
    const [target, setTarget] = useState<number | null>(null)
    const list = useRef<HTMLOListElement>(null)
    let shownNumber = 0

    // Keep the current slide in view when it changes from elsewhere — the keyboard, a new slide.
    useEffect(() => {
        list.current
            ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(current)}"]`)
            ?.scrollIntoView({ block: 'nearest' })
    }, [current])

    const drop = () => {
        if (dragging !== null && target !== null && target !== dragging && target !== dragging + 1) {
            onMove(dragging, target > dragging ? target - 1 : target)
        }
        setDragging(null)
        setTarget(null)
    }

    return (
        <ol className="tp-sorter" ref={list} aria-label="Slides">
            {slides.map((slide, index) => {
                if (!slide.hidden) shownNumber++
                const custom = Boolean(slide.custom)
                return (
                    <React.Fragment key={slide.key}>
                        <Gap index={index} target={target} onInsert={onInsert} />
                        <li
                            data-key={slide.key}
                            className={cx(
                                'tp-sorter__item',
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
                                aria-current={slide.key === current ? 'true' : undefined}
                                aria-label={`${slide.hidden ? 'Hidden slide' : `Slide ${shownNumber}`}: ${slide.label}`}
                            >
                                <Thumb template={template} slide={slide} />
                                <span className="tp-sorter__label">
                                    <Icon name={custom ? 'type' : slide.owner === -1 ? 'slides' : 'file'} size={11} />
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
                                                  { label: 'Duplicate', icon: 'copy' as const, onSelect: () => onDuplicate(slide.key) },
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
            <Gap index={slides.length} target={target} onInsert={onInsert} last />
        </ol>
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
    last,
}: {
    index: number
    target: number | null
    onInsert: (at: number, layout: SlideLayout) => void
    last?: boolean
}) {
    return (
        <li className={cx('tp-sorter__gap', target === index && 'is-target', last && 'tp-sorter__gap--last')}>
            <Menu
                label={last ? 'Add a slide at the end' : 'Insert a slide here'}
                icon="plus"
                align="start"
                items={SLIDE_LAYOUTS.map(({ layout, label }) => ({ label, onSelect: () => onInsert(index, layout) }))}
            />
        </li>
    )
}
