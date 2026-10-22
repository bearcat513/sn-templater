import React, { useState } from 'react'
import { relatedBlocks, type PdfTemplate, type TemplateKind } from '../engine/template'
import { Button, IconButton, cx } from '../ui/controls'
import { Icon } from '../ui/icons'

const DISMISSED = 'templater:designer:guide-dismissed'

const readDismissed = (): boolean => {
    try {
        return window.localStorage.getItem(DISMISSED) === 'true'
    } catch {
        return false
    }
}

/**
 * The first few steps of a template, ticked off as they are done: the
 * fields, a related list, a real record in the preview, then publishing and
 * using it. Shown until it is closed, and closed for good in this browser.
 */
export function GettingStarted({
    template,
    kind,
    previewRecord,
}: {
    template: PdfTemplate
    kind: TemplateKind
    previewRecord: string
}) {
    const [dismissed, setDismissed] = useState(readDismissed)
    if (dismissed) return null

    const blocks = [...template.blocks, ...(template.cover ?? [])]
    const steps = [
        { done: true, label: 'Pick the table', detail: 'Done when the template was made. Change it under Settings.' },
        {
            done: blocks.some(block => block.type === 'fields' || block.type === 'stats' || block.type === 'reference'),
            label: 'Show the record’s fields',
            detail: 'Add a Field list, Stats or Reference record block, then click fields in the Tokens panel.',
        },
        {
            done: relatedBlocks(template).length > 0,
            label: 'Add a related list',
            detail: 'Records that point at this one — tasks, approvals, SLAs — as a table, a chart or a Repeat.',
        },
        {
            done: Boolean(previewRecord),
            label: 'Preview with a real record',
            detail: 'Pick one above the preview to see real values instead of field names.',
        },
        {
            done: false,
            label: kind === 'deck' ? 'Publish, then present it' : 'Publish, then export it',
            detail: 'Save keeps a draft; Publish makes it what everyone uses.',
        },
    ]
    const close = () => {
        try {
            window.localStorage.setItem(DISMISSED, 'true')
        } catch {
            // Shown again next time, then.
        }
        setDismissed(true)
    }

    return (
        <section className="tp-guide" aria-label="Getting started">
            <header className="tp-row tp-row--between">
                <h3 className="tp-guide__title">
                    <Icon name="sparkle" /> Getting started
                </h3>
                <IconButton icon="x" label="Close the getting started steps" size="sm" onClick={close} />
            </header>
            <ol className="tp-guide__steps">
                {steps.map(step => (
                    <li key={step.label} className={cx('tp-guide__step', step.done && 'is-done')}>
                        <span className="tp-guide__check" aria-hidden="true">
                            {step.done ? <Icon name="check" size={12} /> : null}
                        </span>
                        <span>
                            <strong>{step.label}</strong>
                            <span className="tp-sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
                            <span className="tp-subtle"> — {step.detail}</span>
                        </span>
                    </li>
                ))}
            </ol>
            <Button size="sm" variant="ghost" onClick={close}>
                I know my way around
            </Button>
        </section>
    )
}
