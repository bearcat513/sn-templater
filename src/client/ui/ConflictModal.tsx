import React from 'react'
import type { ConflictError } from '../services/http'
import { Button } from './controls'
import { Modal } from './overlays'

/**
 * Someone else saved the record while it was open here. The person saving
 * chooses: take the other version (losing theirs), save theirs over it, or
 * keep both by saving theirs as a copy.
 */
export function ConflictModal({
    conflict,
    what,
    onReload,
    onOverwrite,
    onSaveCopy,
    onClose,
}: {
    conflict: ConflictError | null
    /** "template", "presentation"… */
    what: string
    onReload: () => void
    onOverwrite: () => void
    onSaveCopy?: () => void
    onClose: () => void
}) {
    return (
        <Modal
            open={conflict !== null}
            title={`This ${what} was changed by someone else`}
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onReload}>Load theirs</Button>
                    {onSaveCopy && <Button onClick={onSaveCopy}>Save mine as a copy</Button>}
                    <Button variant="danger" onClick={onOverwrite}>
                        Save mine over theirs
                    </Button>
                </>
            }
        >
            <div className="tp-stack">
                <p>
                    {conflict?.updatedBy || 'Someone'} saved this {what}
                    {conflict?.updatedOn ? ` at ${conflict.updatedOn}` : ''}, after you opened it. Saving now would
                    replace their changes with yours.
                </p>
                <p className="tp-muted">
                    Your changes are kept in this browser until you choose, so reloading first to look at theirs does
                    not lose them for good: they are offered back when you open it again.
                </p>
            </div>
        </Modal>
    )
}
