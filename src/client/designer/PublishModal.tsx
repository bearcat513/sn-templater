import React, { useState } from 'react'
import type { ChartUsage } from '../services/templates'
import { Button, Field, Notice, Textarea } from '../ui/controls'
import { Modal } from '../ui/overlays'

/**
 * Publishing: what the new version is for, in a sentence, kept with it in the
 * history — and, for a chart placed elsewhere, where the change will show.
 */
export function PublishModal({
    open,
    version,
    busy,
    usages,
    onClose,
    onPublish,
}: {
    open: boolean
    version: number
    busy: boolean
    /** For a chart template: the templates and presentations that place it. */
    usages?: ChartUsage[]
    onClose: () => void
    onPublish: (note: string) => void
}) {
    const [note, setNote] = useState('')
    return (
        <Modal
            open={open}
            title={`Publish version ${version}`}
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        icon="publish"
                        busy={busy}
                        onClick={() => {
                            onPublish(note.trim())
                            setNote('')
                        }}
                    >
                        Publish
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <p>
                    Exports, decks and presentations that use this template will use these changes from now on. The
                    version they replace stays in the history.
                </p>
                {usages && usages.length > 0 && (
                    <Notice
                        kind="warning"
                        title={`This chart is placed in ${usages.length} other place${usages.length === 1 ? '' : 's'}`}
                    >
                        <UsageList usages={usages} />
                    </Notice>
                )}
                <Field label="What changed" hint="Optional. Shown in the history beside this version.">
                    <Textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}

/** Where a chart template is placed, each a link that opens it in a new tab. */
export function UsageList({ usages }: { usages: ChartUsage[] }) {
    return (
        <ul className="tp-usages">
            {usages.map(usage => (
                <li key={`${usage.kind}:${usage.sysId}`}>
                    <a
                        href={`?view=${usage.kind === 'template' ? 'edit' : 'build'}&id=${usage.sysId}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {usage.name || 'Untitled'}
                    </a>{' '}
                    <span className="tp-subtle">{usage.kind === 'template' ? 'template' : 'presentation'}</span>
                </li>
            ))}
        </ul>
    )
}
