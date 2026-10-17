import { useCallback, useEffect, useState } from 'react'
import { log } from '../debug/log'

export type View = 'templates' | 'edit' | 'export' | 'present'

const VIEWS: View[] = ['templates', 'edit', 'export', 'present']

export type Route = { view: View; params: URLSearchParams }

const readRoute = (): Route => {
    const params = new URLSearchParams(window.location.search)
    const view = params.get('view') as View | null
    return { view: view && VIEWS.includes(view) ? view : 'templates', params }
}

const TITLES: Record<View, string> = {
    templates: 'Templates',
    edit: 'Template designer',
    export: 'Export to PDF',
    present: 'Present',
}

/** Sets the tab title — or, inside the Next Experience shell, the shell's. */
export function setPageTitle(title: string) {
    const full = `${title} · Templater`
    if (window.self !== window.top && window.CustomEvent.fireTop) {
        window.CustomEvent.fireTop('magellanNavigator.permalink.set', {
            relativePath: window.location.pathname + window.location.search,
            title: full,
        })
    }
    document.title = full
}

/**
 * The view lives in the query string (`?view=edit&id=…`), so every screen has
 * a URL that can be bookmarked, shared and reloaded, and back and forward work.
 */
export function useRoute() {
    const [route, setRoute] = useState<Route>(readRoute)

    useEffect(() => {
        const onPop = () => {
            const next = readRoute()
            log.debug('route', `Back/forward to ${next.view}`, Object.fromEntries(next.params))
            setRoute(next)
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    const navigate = useCallback(
        (view: View, params: Record<string, string | undefined> = {}, options: { replace?: boolean } = {}) => {
            const search = new URLSearchParams({ view })
            for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
            const path = `${window.location.pathname}?${search.toString()}`
            if (options.replace) window.history.replaceState({}, '', path)
            else window.history.pushState({}, '', path)
            log.debug('route', `Navigate to ${view}`, Object.fromEntries(search))
            setPageTitle(TITLES[view])
            setRoute({ view, params: search })
            window.scrollTo(0, 0)
        },
        []
    )

    return { route, navigate }
}

export type Navigate = ReturnType<typeof useRoute>['navigate']
