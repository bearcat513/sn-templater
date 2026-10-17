import { createContext, useContext } from 'react'
import type { SessionContext } from '../services/schema'

const Session = createContext<SessionContext | null>(null)

export const SessionProvider = Session.Provider

/** Who is signed in, and what they may do. Always present below the app shell. */
export function useSession(): SessionContext {
    const session = useContext(Session)
    if (!session) throw new Error('useSession must be used inside the app shell.')
    return session
}

/** For the rare render that happens before the session has loaded. */
export const FALLBACK_SESSION: SessionContext = {
    userId: '',
    userName: '',
    displayName: '',
    email: '',
    date: new Date().toLocaleDateString(),
    dateTime: new Date().toLocaleString(),
    canEdit: false,
}

export function useOptionalSession(): SessionContext {
    return useContext(Session) ?? FALLBACK_SESSION
}

export type { SessionContext }
