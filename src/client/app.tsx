import React, { useEffect, useMemo } from 'react'
import { SessionProvider } from './data/session'
import { log, useInspect } from './debug/log'
import { setDebugEnabled } from './debug/store'
import { useAsync } from './hooks/useAsync'
import { setPageTitle, useRoute, type View } from './hooks/useRoute'
import { SchemaService } from './services/schema'
import { Icon, type IconName } from './ui/icons'
import { Notice, Spinner, cx } from './ui/controls'
import { EditorView } from './views/EditorView'
import { ExportView } from './views/ExportView'
import { PresentView } from './views/PresentView'
import { BuilderView } from './views/BuilderView'
import { TemplatesView } from './views/TemplatesView'

const NAV: { view: View; label: string; icon: IconName }[] = [
    { view: 'templates', label: 'Templates', icon: 'layers' },
    { view: 'export', label: 'Export to PDF', icon: 'download' },
    { view: 'present', label: 'Present', icon: 'play' },
]

export default function App() {
    const { route, navigate } = useRoute()
    const session = useAsync(() => SchemaService.context(), [])

    // The debug property arrives with the session; without a session there are no developer tools.
    useEffect(() => {
        if (session.loading) return
        setDebugEnabled(Boolean(session.data?.debug))
        if (session.data?.debug) log.info('app', `Debugging on for ${session.data.userName}`, session.data)
    }, [session.loading, session.data])
    useInspect('session', session.data)
    useInspect('route', useMemo(() => ({ view: route.view, params: Object.fromEntries(route.params) }), [route]))

    useEffect(() => {
        if (route.view !== 'edit' && route.view !== 'build') setPageTitle(NAV.find(item => item.view === route.view)?.label ?? 'Templater')
    }, [route.view])

    const active = route.view === 'edit' ? 'templates' : route.view === 'build' ? 'present' : route.view
    // Remounting a view when its query changes resets it, so opening a second
    // record from a form starts clean rather than inheriting the first.
    const viewKey = route.params.toString()

    return (
        <div className="tp-app">
            <header className="tp-header">
                <a
                    className="tp-brand"
                    href="?view=templates"
                    onClick={event => {
                        event.preventDefault()
                        navigate('templates')
                    }}
                >
                    <span className="tp-brand__mark" aria-hidden="true">
                        <Icon name="file" size={16} />
                    </span>
                    Templater
                </a>
                <nav className="tp-nav" aria-label="Templater">
                    {NAV.map(item => (
                        <a
                            key={item.view}
                            href={`?view=${item.view}`}
                            className={cx('tp-nav__item', active === item.view && 'is-active')}
                            aria-current={active === item.view ? 'page' : undefined}
                            onClick={event => {
                                event.preventDefault()
                                navigate(item.view)
                            }}
                        >
                            <Icon name={item.icon} size={14} />
                            {item.label}
                        </a>
                    ))}
                </nav>
                {session.data && (
                    <span className="tp-header__user tp-truncate" title={session.data.email}>
                        {session.data.displayName}
                    </span>
                )}
            </header>

            <main className="tp-main">
                {session.loading ? (
                    <div className="tp-loading">
                        <Spinner /> Starting Templater…
                    </div>
                ) : session.error || !session.data ? (
                    <div className="tp-page tp-page--narrow">
                        <Notice
                            kind="critical"
                            title="Templater could not start"
                            lines={[
                                session.error || 'No session.',
                                'Templater needs the x_1040823_template.user role (or .editor to design templates).',
                            ]}
                        />
                    </div>
                ) : (
                    <SessionProvider value={session.data}>
                        {route.view === 'templates' && <TemplatesView navigate={navigate} />}
                        {route.view === 'edit' && (
                            <EditorView key={viewKey} id={route.params.get('id') ?? ''} navigate={navigate} />
                        )}
                        {route.view === 'export' && <ExportView key={viewKey} params={route.params} navigate={navigate} />}
                        {route.view === 'present' && <PresentView key={viewKey} params={route.params} navigate={navigate} />}
                        {route.view === 'build' && <BuilderView key={viewKey} params={route.params} navigate={navigate} />}
                    </SessionProvider>
                )}
            </main>
        </div>
    )
}
