import '@fontsource-variable/fraunces'
import '@fontsource-variable/manrope'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('Could not find the root application element')
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
