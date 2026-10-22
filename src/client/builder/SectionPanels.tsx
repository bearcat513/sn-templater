import React from 'react'
import type { LoadedSection } from '../data/deck'
import type { DeckSection } from '../engine/presentation'
import type { Slide } from '../slides/paginate'
import { Button, EmptyState, Field, Input, Notice, Spinner } from '../ui/controls'
import { TransitionSection, type TransitionControl } from './Inspector'

/** What the canvas shows for a section's header: what the section is, at the size of a slide. */
export function SectionSummary({
    width,
    aspect,
    name,
    loaded,
    count,
}: {
    width: number
    aspect: number
    name: string
    loaded?: LoadedSection
    count: number
}) {
    const deck = loaded?.deck
    return (
        <div className="tp-builder__section" style={{ width, height: width / aspect }}>
            <EmptyState icon="layers" title={name}>
                {!loaded ? (
                    <span className="tp-row">
                        <Spinner size={14} /> Reading its records…
                    </span>
                ) : deck ? (
                    `${count} slide${count === 1 ? '' : 's'} from ${deck.job.records.length} ${deck.schema.label} record${
                        deck.job.records.length === 1 ? '' : 's'
                    }, drawn by the template each time the presentation opens. Select one to see it.`
                ) : (
                    'Its slides could not be drawn.'
                )}
            </EmptyState>
        </div>
    )
}

/** The inspector for a section's header: its name, where its slides come from, and what can be done with them. */
export function SectionInspector({
    section,
    name,
    loaded,
    slides,
    onRename,
    onChange,
    onHide,
    onRemove,
    onEditTemplate,
}: {
    section: DeckSection
    name: string
    loaded?: LoadedSection
    slides: Slide[]
    onRename: (name: string) => void
    onChange: () => void
    onHide: (hidden: boolean) => void
    onRemove: () => void
    onEditTemplate: () => void
}) {
    const deck = loaded?.deck
    const allHidden = slides.length > 0 && slides.every(slide => slide.hidden)
    return (
        <div className="tp-inspector">
            <section className="tp-inspector__section">
                <h3 className="tp-inspector__title">Section</h3>
                <Field label="Template">
                    <span className="tp-truncate">{deck?.record.name ?? name}</span>
                </Field>
                <Field label="Records">
                    <span className="tp-subtle">
                        {deck
                            ? `${deck.job.records.length} of ${deck.matched.toLocaleString()} ${deck.schema.label} record${deck.matched === 1 ? '' : 's'}`
                            : loaded
                              ? 'Not loaded'
                              : 'Reading…'}
                        {section.query ? ' matching its filter' : ''}
                    </span>
                </Field>
                {deck && (
                    <Field label="Shown in the sorter as">
                        <Input
                            value={section.name ?? ''}
                            placeholder={deck.record.name}
                            maxLength={100}
                            onChange={event => onRename(event.target.value)}
                        />
                    </Field>
                )}
                <Notice kind="critical" lines={loaded?.error ? [loaded.error] : []} />
                <div className="tp-stack tp-stack--tight">
                    <Button icon="settings" onClick={onChange}>
                        Change template and records
                    </Button>
                    <Button
                        icon={allHidden ? 'eye' : 'eyeOff'}
                        disabled={!slides.length}
                        onClick={() => onHide(!allHidden)}
                    >
                        {allHidden ? 'Show its slides' : 'Hide its slides'}
                    </Button>
                    <Button icon="external" variant="ghost" onClick={onEditTemplate}>
                        Edit the template
                    </Button>
                    <Button icon="trash" variant="ghost" onClick={onRemove}>
                        Remove section
                    </Button>
                </div>
                <p className="tp-subtle">
                    Drag the section in the slide list to move all of its slides. Its slides can be moved, hidden and
                    given notes one at a time, like any other.
                </p>
            </section>
        </div>
    )
}

/** The inspector for a slide drawn from a record or a title slide: it can be moved and hidden, not edited. */
export function RecordSlideInspector({
    slide,
    templateName,
    link,
    transition,
    onToggleHidden,
    onAddAfter,
}: {
    slide: Slide
    /** The template that draws it, in quotes, or null for the deck's own. */
    templateName: string | null
    link: string | null
    transition: TransitionControl | null
    onToggleHidden: () => void
    onAddAfter: () => void
}) {
    const source = templateName ? `“${templateName}”` : 'the deck template'
    return (
        <div className="tp-inspector">
            <section className="tp-inspector__section">
                <h3 className="tp-inspector__title">{slide.owner < 0 ? 'Title slide' : 'Record slide'}</h3>
                <p className="tp-muted">
                    {slide.owner < 0
                        ? `The title slide of ${source}.`
                        : `Drawn from ${slide.label} by ${source}, each time the presentation opens.`}{' '}
                    Move it or hide it here; change what is on it in the template.
                </p>
                <div className="tp-stack tp-stack--tight">
                    <Button icon={slide.hidden ? 'eye' : 'eyeOff'} onClick={onToggleHidden}>
                        {slide.hidden ? 'Show slide' : 'Hide slide'}
                    </Button>
                    <Button icon="plus" onClick={onAddAfter}>
                        Add a slide after it
                    </Button>
                    {link && (
                        <a className="tp-btn tp-btn--ghost tp-btn--md" href={link} target="_blank" rel="noreferrer">
                            <span>Open the record</span>
                        </a>
                    )}
                </div>
            </section>
            {transition && <TransitionSection control={transition} />}
        </div>
    )
}
