import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pageDimensions } from '../engine/pdf'
import { buildSequence } from '../engine/presentation'
import type { RenderJob } from '../engine/render'
import { resolvePage } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { useElementSize } from '../hooks/useElementSize'
import { Icon } from '../ui/icons'
import { IconButton, cx } from '../ui/controls'
import { paginate, type Slide } from './paginate'
import { SlideView } from './SlideView'

type Props = {
    template: PdfTemplate
    job: RenderJob
    title: string
    onExit: () => void
    onExport: () => void
    /** Opens the record behind a slide on the platform. */
    recordUrl?: (owner: number) => string | null
    /** A presentation's own running order, hidden slides already left out. Absent is the deck as drawn. */
    slides?: Slide[]
    startAt?: number
    /** Opens the slide builder on this deck. */
    onEdit?: () => void
    editLabel?: string
}

/** How many build steps a slide has: its elements that wait for a click. */
const stepsOf = (slide: Slide | undefined): number => (slide?.custom ? buildSequence(slide.custom).length : 0)

/**
 * The deck, on screen.
 *
 * Keys: → / Space / Page Down (or a click on the slide) for the next build
 * step or slide, ← / Page Up for the one before, Home and End, G for the
 * overview, N for the speaker notes, F for full screen, Esc to leave. In full
 * screen the controls get out of the way until the mouse moves.
 */
export function Presenter({
    template,
    job,
    title,
    onExit,
    onExport,
    recordUrl,
    slides: arranged,
    startAt = 0,
    onEdit,
    editLabel = 'Edit slides',
}: Props) {
    const slides = useMemo(() => arranged ?? paginate(template, job), [arranged, template, job])
    const [index, setIndex] = useState(startAt)
    /** How many of the current slide's build steps are showing, and which one just arrived. */
    const [step, setStep] = useState(0)
    const [animate, setAnimate] = useState<number | undefined>(undefined)
    const [direction, setDirection] = useState<1 | -1>(1)
    const [notesOpen, setNotesOpen] = useState(false)
    const [overview, setOverview] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [idle, setIdle] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const stage = useRef<HTMLDivElement>(null)
    const stageSize = useElementSize(stage)

    const page = resolvePage(template)
    const sheet = pageDimensions(page.size, page.landscape)
    const aspect = sheet.width / sheet.height
    const slideWidth = Math.max(
        120,
        Math.floor(Math.min(stageSize.width - 32, (stageSize.height - 32) * aspect))
    )

    const count = slides.length
    /** To a slide: forward arrives with nothing built yet, back arrives finished, as PowerPoint does. */
    const go = useCallback(
        (next: number, built = false) => {
            const target = Math.max(0, Math.min(count - 1, next))
            setDirection(target < index ? -1 : 1)
            setIndex(target)
            setStep(built ? stepsOf(slides[target]) : 0)
            setAnimate(undefined)
        },
        [count, index, slides]
    )

    const forward = useCallback(() => {
        if (step < stepsOf(slides[index])) {
            setAnimate(step)
            setStep(step + 1)
        } else if (index < count - 1) go(index + 1)
    }, [step, slides, index, count, go])

    const back = useCallback(() => {
        if (step > 0) {
            setAnimate(undefined)
            setStep(step - 1)
        } else if (index > 0) go(index - 1, true)
    }, [step, index, go])

    useEffect(() => {
        if (index > count - 1) setIndex(Math.max(0, count - 1))
    }, [count, index])

    /* ------------------------------ full screen ----------------------------- */

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void root.current?.requestFullscreen?.()
    }, [])

    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === root.current)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    useEffect(() => {
        if (!fullscreen) {
            setIdle(false)
            return
        }
        let timer = window.setTimeout(() => setIdle(true), 2500)
        const wake = () => {
            setIdle(false)
            window.clearTimeout(timer)
            timer = window.setTimeout(() => setIdle(true), 2500)
        }
        window.addEventListener('mousemove', wake)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('mousemove', wake)
        }
    }, [fullscreen])

    /* -------------------------------- keys -------------------------------- */

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
            if (event.metaKey || event.ctrlKey || event.altKey) return

            switch (event.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                case 'PageDown':
                case ' ':
                case 'Enter':
                    event.preventDefault()
                    forward()
                    break
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'PageUp':
                case 'Backspace':
                    event.preventDefault()
                    back()
                    break
                case 'Home':
                    event.preventDefault()
                    go(0)
                    break
                case 'End':
                    event.preventDefault()
                    go(count - 1, true)
                    break
                case 'n':
                case 'N':
                    setNotesOpen(open => !open)
                    break
                case 'g':
                case 'G':
                    setOverview(open => !open)
                    break
                case 'f':
                case 'F':
                    toggleFullscreen()
                    break
                case 'Escape':
                    if (overview) setOverview(false)
                    else if (!document.fullscreenElement) onExit()
                    break
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [go, forward, back, count, overview, onExit, toggleFullscreen])

    const slide = slides[index]
    const link = slide && slide.owner >= 0 ? recordUrl?.(slide.owner) : null
    const steps = stepsOf(slide)
    const next = slides[index + 1]

    return (
        <div ref={root} className={cx('tp-presenter', fullscreen && 'is-fullscreen', idle && 'is-idle')}>
            <div className="tp-presenter__top">
                <div className="tp-presenter__title tp-truncate">
                    <Icon name="slides" />
                    <span className="tp-truncate">{title}</span>
                </div>
                <div className="tp-row">
                    {onEdit && <IconButton icon="layers" label={editLabel} onClick={onEdit} />}
                    <IconButton
                        icon="notes"
                        label={notesOpen ? 'Hide speaker notes (N)' : 'Speaker notes (N)'}
                        onClick={() => setNotesOpen(!notesOpen)}
                    />
                    <IconButton icon="grid" label="Overview (G)" onClick={() => setOverview(!overview)} />
                    <IconButton icon="download" label="Export as PDF" onClick={onExport} />
                    <IconButton
                        icon={fullscreen ? 'minimize' : 'maximize'}
                        label={fullscreen ? 'Leave full screen (F)' : 'Full screen (F)'}
                        onClick={toggleFullscreen}
                    />
                    <IconButton icon="x" label="Close presenter (Esc)" onClick={onExit} />
                </div>
            </div>

            <div ref={stage} className="tp-presenter__stage">
                {overview ? (
                    <div className="tp-presenter__overview" role="list">
                        {slides.map((entry, at) => (
                            <button
                                key={at}
                                type="button"
                                role="listitem"
                                className={cx('tp-presenter__thumb', at === index && 'is-current')}
                                onClick={() => {
                                    go(at)
                                    setOverview(false)
                                }}
                                aria-label={`Slide ${at + 1}: ${entry.label}`}
                            >
                                <SlideView template={template} slide={entry} width={220} />
                                <span className="tp-presenter__thumb-label tp-truncate">
                                    {at + 1}. {entry.label}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : slide && stageSize.width > 0 ? (
                    <div
                        className={cx(
                            'tp-presenter__slide',
                            `tp-transition--${slide.transition ?? 'fade'}`,
                            direction === -1 && 'is-back'
                        )}
                        key={index}
                        onClick={event => {
                            // A click on the slide moves on, as a clicker does — unless it was on a link.
                            if (!(event.target as HTMLElement).closest('a')) forward()
                        }}
                    >
                        <SlideView
                            template={template}
                            slide={slide}
                            width={slideWidth}
                            interactive
                            builds={steps ? { shown: step, animate } : undefined}
                        />
                    </div>
                ) : null}

                {!overview && (count > 1 || steps > 0) && (
                    <>
                        <button
                            type="button"
                            className="tp-presenter__nav tp-presenter__nav--prev"
                            onClick={back}
                            disabled={index === 0 && step === 0}
                            aria-label="Previous slide"
                        >
                            <Icon name="chevronLeft" size={28} />
                        </button>
                        <button
                            type="button"
                            className="tp-presenter__nav tp-presenter__nav--next"
                            onClick={forward}
                            disabled={index === count - 1 && step >= steps}
                            aria-label="Next slide"
                        >
                            <Icon name="chevronRight" size={28} />
                        </button>
                    </>
                )}
            </div>

            {notesOpen && !overview && (
                <div className="tp-presenter__notes" aria-label="Speaker notes">
                    <div className="tp-presenter__notes-text">
                        {slide?.notes?.trim() ? slide.notes : <span className="tp-presenter__notes-empty">No notes for this slide.</span>}
                    </div>
                    <div className="tp-presenter__notes-next">
                        {steps > step ? (
                            <span>
                                Next: animation {step + 1} of {steps}
                            </span>
                        ) : next ? (
                            <>
                                <span>Next: {next.label}</span>
                                <SlideView template={template} slide={next} width={160} />
                            </>
                        ) : (
                            <span>End of the show</span>
                        )}
                    </div>
                </div>
            )}

            <div className="tp-presenter__bottom">
                <div className="tp-presenter__progress" aria-hidden="true">
                    <span style={{ width: `${count ? ((index + 1) / count) * 100 : 0}%` }} />
                </div>
                <div className="tp-presenter__status">
                    <span className="tp-truncate">{slide?.label ?? 'No slides'}</span>
                    {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="tp-presenter__link">
                            Open record <Icon name="external" size={12} />
                        </a>
                    )}
                    <span className="tp-presenter__count" aria-live="polite">
                        {count ? index + 1 : 0} / {count}
                    </span>
                </div>
            </div>
        </div>
    )
}
