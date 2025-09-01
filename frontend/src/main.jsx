import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SnackbarProvider } from './contexts/SnackbarContext'

const root = createRoot(document.getElementById('root'))

const AppTree = (
  <BrowserRouter>
    <SnackbarProvider>
      <App />
    </SnackbarProvider>
  </BrowserRouter>
)

// Avoid StrictMode in development to prevent intentional double-invocation
// of effects that can cause duplicate network requests. Keep it in prod.
if (import.meta.env.MODE === 'production') {
  root.render(<React.StrictMode>{AppTree}</React.StrictMode>)
} else {
  root.render(AppTree)
}
