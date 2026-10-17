import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pageDimensions } from '../engine/pdf'
import type { RenderJob } from '../engine/render'
import { resolvePage } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { useElementSize } from '../hooks/useElementSize'
import { Icon } from '../ui/icons'
import { IconButton, cx } from '../ui/controls'
import { paginate } from './paginate'
import { SlideView } from './SlideView'

type Props = {
    template: PdfTemplate
    job: RenderJob
    title: string
    onExit: () => void
    onExport: () => void
    /** Opens the record behind a slide on the platform. */
    recordUrl?: (owner: number) => string | null
}

/**
 * The deck, on screen.
 *
 * Keys: → / Space / Page Down for the next slide, ← / Page Up for the one
 * before, Home and End, G for the overview, F for full screen, Esc to leave.
 * In full screen the controls get out of the way until the mouse moves.
 */
export function Presenter({ template, job, title, onExit, onExport, recordUrl }: Props) {
    const slides = useMemo(() => paginate(template, job), [template, job])
    const [index, setIndex] = useState(0)
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
    const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(count - 1, next))), [count])

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
                case 'PageDown':
                case ' ':
                    event.preventDefault()
                    go(index + 1)
                    break
                case 'ArrowLeft':
                case 'PageUp':
                case 'Backspace':
                    event.preventDefault()
                    go(index - 1)
                    break
                case 'Home':
                    event.preventDefault()
                    go(0)
                    break
                case 'End':
                    event.preventDefault()
                    go(count - 1)
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
    }, [go, index, count, overview, onExit, toggleFullscreen])

    const slide = slides[index]
    const link = slide && slide.owner >= 0 ? recordUrl?.(slide.owner) : null

    return (
        <div ref={root} className={cx('tp-presenter', fullscreen && 'is-fullscreen', idle && 'is-idle')}>
            <div className="tp-presenter__top">
                <div className="tp-presenter__title tp-truncate">
                    <Icon name="slides" />
                    <span className="tp-truncate">{title}</span>
                </div>
                <div className="tp-row">
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
                                    setIndex(at)
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
                    <div className="tp-presenter__slide" key={index}>
                        <SlideView template={template} slide={slide} width={slideWidth} />
                    </div>
                ) : null}

                {!overview && count > 1 && (
                    <>
                        <button
                            type="button"
                            className="tp-presenter__nav tp-presenter__nav--prev"
                            onClick={() => go(index - 1)}
                            disabled={index === 0}
                            aria-label="Previous slide"
                        >
                            <Icon name="chevronLeft" size={28} />
                        </button>
                        <button
                            type="button"
                            className="tp-presenter__nav tp-presenter__nav--next"
                            onClick={() => go(index + 1)}
                            disabled={index === count - 1}
                            aria-label="Next slide"
                        >
                            <Icon name="chevronRight" size={28} />
                        </button>
                    </>
                )}
            </div>

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
