import React from 'react'
import { Button, cx } from './controls'

/**
 * How far a long job has got: what it is doing, a bar — filled in proportion
 * when the total is known, moving when it is not — and a way to stop it.
 */
export function Progress({
    label,
    done,
    total,
    onCancel,
}: {
    label: string
    done?: number
    total?: number
    onCancel?: () => void
}) {
    const known = total !== undefined && total > 0 && done !== undefined
    const share = known ? Math.min(1, done! / total!) : 0
    return (
        <div className="tp-progress">
            <div className="tp-row tp-row--between">
                <span className="tp-subtle" aria-live="polite">
                    {label}
                    {known ? ` — ${done!.toLocaleString()} of ${total!.toLocaleString()}` : ''}
                </span>
                {onCancel && (
                    <Button size="sm" variant="ghost" icon="x" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
            <div
                className={cx('tp-progress__bar', !known && 'tp-progress__bar--indeterminate')}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={known ? total : undefined}
                aria-valuenow={known ? done : undefined}
            >
                <div className="tp-progress__fill" style={known ? { width: `${share * 100}%` } : undefined} />
            </div>
        </div>
    )
}
