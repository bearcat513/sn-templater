import React from 'react'
import { Notice } from './controls'

/**
 * Shown instead of an editor on a screen too narrow for it (see features.css):
 * what the editor needs, and what can still be done here.
 */
export function NarrowNotice({
    editor,
    children,
}: {
    /** Which editor, and so which width it needs. */
    editor: 'builder' | 'designer'
    /** Buttons for what works on a small screen. */
    children?: React.ReactNode
}) {
    return (
        <div className={`tp-narrow-notice tp-narrow-notice--${editor}`}>
            <Notice
                kind="info"
                title={
                    editor === 'builder'
                        ? 'The slide builder needs a wider window'
                        : 'The designer needs a wider window'
                }
                lines={[
                    `Make the window at least ${editor === 'builder' ? '1100' : '900'} pixels wide to ${
                        editor === 'builder' ? 'arrange and edit slides' : 'edit the template'
                    }. You can still use what is below.`,
                ]}
            >
                {children && <div className="tp-row tp-row--wrap">{children}</div>}
            </Notice>
        </div>
    )
}
