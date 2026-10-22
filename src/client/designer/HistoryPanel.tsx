import React, { useState } from 'react'
import { openPictures } from '../data/pictures'
import { describeChanges, type Change } from '../engine/diff'
import type { PdfTemplate, StarterField, TemplateKind } from '../engine/template'
import { readTemplate } from '../engine/validate'
import { useAsync } from '../hooks/useAsync'
import { downloadBytes } from '../hooks/usePdf'
import { TEMPLATE_TABLE, TemplateService, type TemplateVersion } from '../services/templates'
import { Badge, Button, EmptyState, Notice, Spinner, cx } from '../ui/controls'

const CHANGE_TONES: Record<Change['kind'], 'positive' | 'critical' | 'neutral'> = {
    added: 'positive',
    removed: 'critical',
    changed: 'neutral',
}

/**
 * A template's published versions: who published each, when and why, what
 * each changed from the editor's template, and a way back to any of them.
 * Restoring puts the version in the editor, as a change like any other — it
 * is saved and published the usual way, so the history only ever grows.
 */
export function HistoryPanel({
    sysId,
    kind,
    fields,
    current,
    canEdit,
    onRestore,
}: {
    sysId: string
    kind: TemplateKind
    fields: StarterField[]
    /** The template in the editor, which each version is compared with. */
    current: PdfTemplate
    canEdit: boolean
    onRestore: (template: PdfTemplate, version: TemplateVersion) => void
}) {
    const versions = useAsync(() => TemplateService.versions(sysId), [sysId])
    const [chosen, setChosen] = useState<TemplateVersion | null>(null)
    const body = useAsync(
        async () => {
            const read = readTemplate(await TemplateService.versionBody(chosen!.sysId), kind, fields)
            if (!read.ok) throw new Error(read.error)
            return openPictures(read.value, TEMPLATE_TABLE, sysId)
        },
        [chosen?.sysId],
        Boolean(chosen)
    )
    const changes = body.data ? describeChanges(body.data, current) : []

    if (versions.loading) {
        return (
            <div className="tp-loading">
                <Spinner /> Reading the history…
            </div>
        )
    }

    return (
        <div className="tp-page tp-page--narrow tp-history">
            <Notice kind="critical" lines={versions.error ? [versions.error] : []} />
            {!versions.data?.length ? (
                <EmptyState icon="history" title="No published versions yet">
                    Each time the template is published, the version that went out is kept here, to compare with and
                    restore.
                </EmptyState>
            ) : (
                <div className="tp-history__layout">
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
                    <section className="tp-card tp-history__detail" aria-live="polite">
                        <div className="tp-card__body tp-stack">
                            {!chosen ? (
                                <p className="tp-muted">Choose a version to see how it differs from the editor.</p>
                            ) : body.loading ? (
                                <p className="tp-row tp-subtle">
                                    <Spinner size={14} /> Reading version {chosen.version}…
                                </p>
                            ) : body.error ? (
                                <Notice kind="critical" lines={[body.error]} />
                            ) : (
                                <>
                                    <h2 className="tp-card__title">
                                        From version {chosen.version} to what is in the editor
                                    </h2>
                                    {changes.length ? (
                                        <ul className="tp-history__changes">
                                            {changes.map((change, index) => (
                                                <li key={index}>
                                                    <Badge tone={CHANGE_TONES[change.kind]}>{change.kind}</Badge>{' '}
                                                    {change.what}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="tp-muted">No differences: the editor has this version.</p>
                                    )}
                                    <div className="tp-row">
                                        {canEdit && (
                                            <Button
                                                variant="primary"
                                                icon="undo"
                                                disabled={!changes.length}
                                                onClick={() => onRestore(body.data!, chosen)}
                                            >
                                                Restore into the editor
                                            </Button>
                                        )}
                                        <Button
                                            icon="download"
                                            onClick={() =>
                                                downloadBytes(
                                                    new TextEncoder().encode(JSON.stringify(body.data, null, 2)),
                                                    `version-${chosen.version}.json`,
                                                    'application/json'
                                                )
                                            }
                                        >
                                            Download JSON
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    )
}
