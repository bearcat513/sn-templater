import React, { useState } from 'react'
import { useSession } from '../data/session'
import { CommentService, type SlideComment } from '../services/collaboration'
import { Button, IconButton, Notice, Spinner, Textarea, cx } from '../ui/controls'

/**
 * Comments on the slide in the builder: what reviewers asked for, and a
 * way to answer or resolve it. A comment belongs to the slide's key, so one
 * on a record's slide follows that record for as long as it is in the deck.
 * Its author, the presentation's author and editors can resolve or delete it.
 */
export function CommentsPanel({
    presentation,
    comments,
    loading,
    error,
    slide,
    presentationAuthor,
    onChange,
}: {
    presentation: string
    comments: SlideComment[]
    loading: boolean
    error: string
    slide: string
    presentationAuthor: string
    onChange: (comments: SlideComment[]) => void
}) {
    const session = useSession()
    const [draft, setDraft] = useState('')
    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState('')
    const [showResolved, setShowResolved] = useState(false)
    const mine = comments.filter(comment => comment.slide === slide)
    const shown = mine.filter(comment => showResolved || !comment.resolved)
    const resolvedCount = mine.length - mine.filter(comment => !comment.resolved).length
    const canManage = (comment: SlideComment) =>
        session.canEdit || comment.author === session.userName || presentationAuthor === session.userName

    const run = async (work: () => Promise<SlideComment[]>) => {
        setBusy(true)
        setFailure('')
        try {
            onChange(await work())
        } catch (cause) {
            setFailure(cause instanceof Error ? cause.message : 'The comment could not be saved.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="tp-comments" aria-label="Comments on this slide">
            <Notice kind="critical" lines={[error, failure].filter(Boolean)} />
            {loading ? (
                <p className="tp-row tp-subtle">
                    <Spinner size={14} /> Reading comments…
                </p>
            ) : (
                <>
                    {shown.length === 0 && <p className="tp-subtle">No comments on this slide.</p>}
                    <ol className="tp-comments__list">
                        {shown.map(comment => (
                            <li key={comment.sysId} className={cx('tp-comments__item', comment.resolved && 'is-resolved')}>
                                <div className="tp-row tp-row--between">
                                    <span>
                                        <strong>{comment.authorName || comment.author}</strong>{' '}
                                        <span className="tp-subtle">{comment.createdOn}</span>
                                    </span>
                                    {canManage(comment) && (
                                        <span className="tp-row">
                                            <IconButton
                                                icon={comment.resolved ? 'undo' : 'check'}
                                                size="sm"
                                                label={comment.resolved ? 'Reopen' : 'Resolve'}
                                                disabled={busy}
                                                onClick={() =>
                                                    void run(async () => {
                                                        await CommentService.resolve(comment.sysId, !comment.resolved)
                                                        return comments.map(item =>
                                                            item.sysId === comment.sysId
                                                                ? { ...item, resolved: !item.resolved }
                                                                : item
                                                        )
                                                    })
                                                }
                                            />
                                            <IconButton
                                                icon="trash"
                                                size="sm"
                                                tone="danger"
                                                label="Delete comment"
                                                disabled={busy}
                                                onClick={() =>
                                                    void run(async () => {
                                                        await CommentService.remove(comment.sysId)
                                                        return comments.filter(item => item.sysId !== comment.sysId)
                                                    })
                                                }
                                            />
                                        </span>
                                    )}
                                </div>
                                <p className="tp-comments__text">{comment.text}</p>
                            </li>
                        ))}
                    </ol>
                    {resolvedCount > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setShowResolved(!showResolved)}>
                            {showResolved ? 'Hide resolved' : `Show ${resolvedCount} resolved`}
                        </Button>
                    )}
                    <div className="tp-comments__new">
                        <Textarea
                            rows={2}
                            maxLength={4000}
                            value={draft}
                            placeholder="Add a comment on this slide"
                            aria-label="New comment"
                            onChange={event => setDraft(event.target.value)}
                        />
                        <Button
                            size="sm"
                            variant="primary"
                            disabled={!draft.trim() || busy}
                            busy={busy}
                            onClick={() =>
                                void run(async () => {
                                    const added = await CommentService.add(presentation, slide, draft.trim())
                                    setDraft('')
                                    return [...comments, added]
                                })
                            }
                        >
                            Comment
                        </Button>
                    </div>
                </>
            )}
        </section>
    )
}
