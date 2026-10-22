import React from 'react'
import { Icon } from './icons'

/**
 * Everything a render could not do as asked, in one place: tokens that
 * printed blank, pictures and lists that were not drawn, links refused, rows
 * left out. Shared by the designer's preview, the chart designer and the
 * export screen, so a problem reads the same wherever it shows up.
 */
export function ProblemsPanel({
    unknownTokens = [],
    problems = [],
    notes = [],
}: {
    /** Tokens that resolved to nothing. */
    unknownTokens?: string[]
    /** What the renderer could not draw, each a sentence. */
    problems?: string[]
    /** What was drawn but shortened — a capped batch, a capped list. */
    notes?: string[]
}) {
    const count = (unknownTokens.length ? 1 : 0) + problems.length + notes.length
    if (!count) return null
    return (
        <details className="tp-problems" open={count <= 3}>
            <summary>
                <Icon name="alert" size={14} />
                {count} {count === 1 ? 'thing' : 'things'} to check
            </summary>
            <div className="tp-problems__body" role="status">
                {unknownTokens.length > 0 && (
                    <div className="tp-problems__group">
                        <h4>Printed blank — no such field</h4>
                        <p className="tp-mono">{unknownTokens.map(token => `{{${token}}}`).join(', ')}</p>
                    </div>
                )}
                {problems.length > 0 && (
                    <div className="tp-problems__group">
                        <h4>Not drawn as asked</h4>
                        <ul className="tp-problems__list">
                            {problems.map(problem => (
                                <li key={problem}>{problem}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {notes.length > 0 && (
                    <div className="tp-problems__group">
                        <h4>Left out</h4>
                        <ul className="tp-problems__list">
                            {notes.map(note => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </details>
    )
}
