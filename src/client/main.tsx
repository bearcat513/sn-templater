import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { ToastProvider } from './ui/overlays'
import './styles/tokens.css'
import './styles/base.css'
import './styles/controls.css'
import './styles/layout.css'
import './styles/designer.css'
import './styles/sheet.css'

const rootElement = document.getElementById('root')
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <ToastProvider>
                <App />
            </ToastProvider>
        </React.StrictMode>
    )
}
