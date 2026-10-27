// First, so the page's scripts are put right before anything relies on them.
import './platform'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { DevTools } from './debug/DevTools'
import { installDebugCapture } from './debug/log'
import { ToastProvider } from './ui/overlays'
import './styles/tokens.css'
import './styles/base.css'
import './styles/controls.css'
import './styles/display.css'
import './styles/layout.css'
import './styles/designer.css'
import './styles/editors.css'
import './styles/sheet.css'
import './styles/builder.css'
import './styles/canvas.css'
import './styles/motion.css'
import './styles/devtools.css'
import './styles/features.css'
import './styles/collaboration.css'

// Records from the first request on; `/me` then says whether to keep it or drop it.
installDebugCapture()

const rootElement = document.getElementById('root')
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <ToastProvider>
                <App />
                <DevTools />
            </ToastProvider>
        </React.StrictMode>
    )
}
