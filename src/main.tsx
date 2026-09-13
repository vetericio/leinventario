import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: somente em produção e fora do preview do editor
const host = window.location.hostname
const isPreview = host.includes('id-preview') || host === 'localhost' || host === '127.0.0.1'

if ('serviceWorker' in navigator && import.meta.env.PROD && !isPreview) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
