import React, { useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { PresentationService, type PresentationVersion } from '../services/presentations'
import { Badge, Button, EmptyState, Notice, Spinner, cx } from '../ui/controls'
import { Modal } from '../ui/overlays'

/**
 * A presentation's published versions: who published each, when and why,
 * and a way back to any of them. Restoring puts the version in the builder
 * as a change like any other — saved and published the usual way — so the
 * history only ever grows.
 */
export function PresentationHistory({
    sysId,
    canChange,
    onClose,
    onRestore,
}: {
    sysId: string
    canChange: boolean
    onClose: () => void
    onRestore: (version: PresentationVersion) => Promise<void>
}) {
    const versions = useAsync(() => PresentationService.versions(sysId), [sysId])
    const [chosen, setChosen] = useState<PresentationVersion | null>(null)
    const [restoring, setRestoring] = useState(false)
    const [error, setError] = useState('')

    return (
        <Modal
            open
            size="lg"
            title="Published versions"
            onClose={onClose}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                    {canChange && (
                        <Button
                            variant="primary"
                            icon="undo"
                            busy={restoring}
                            disabled={!chosen}
                            onClick={async () => {
                                if (!chosen) return
                                setRestoring(true)
                                setError('')
                                try {
                                    await onRestore(chosen)
                                    onClose()
                                } catch (failure) {
                                    setError(failure instanceof Error ? failure.message : 'It could not be restored.')
                                } finally {
                                    setRestoring(false)
                                }
                            }}
                        >
                            Restore into the builder
                        </Button>
                    )}
                </>
            }
        >
            <Notice kind="critical" lines={[versions.error, error].filter(Boolean) as string[]} />
            {versions.loading ? (
                <div className="tp-loading">
                    <Spinner /> Reading the history…
                </div>
            ) : !versions.data?.length ? (
                <EmptyState icon="history" title="No published versions yet">
                    Each time the presentation is published, what went out is kept here, to restore.
                </EmptyState>
            ) : (
                <ol className="tp-history__list" aria-label="Published versions">
                    {versions.data.map((version, index) => (
                        <li key={version.sysId}>
                            <button
                                type="button"
                                className={cx('tp-history__item', chosen?.sysId === version.sysId && 'is-active')}
                                aria-current={chosen?.sysId === version.sysId ? 'true' : undefined}
                                onClick={() => setChosen(version)}
                            >
                                <span className="tp-row">
                                    <strong>Version {version.version}</strong>
                                    {index === 0 && <Badge tone="primary">Published</Badge>}
                                </span>
                                <span className="tp-subtle">
                                    {version.publishedOn} · {version.publishedBy}
                                </span>
                                {version.note && <span className="tp-history__note">{version.note}</span>}
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </Modal>
    )
}
