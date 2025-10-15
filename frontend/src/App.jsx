import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { Moon as Brightness4Icon, Sun as Brightness7Icon } from 'lucide-react'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import VerifyPage from './pages/VerifyPage'
import SetPasswordPage from './pages/SetPasswordPage'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './Dashboard/Dashboard'
import { buildTheme, getThemeKeyForMode } from './theme'
import { apiCall } from './config/api'

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [name, setName] = useState(() => localStorage.getItem('name'))
  const [email, setEmail] = useState(() => localStorage.getItem('email'))

  const login = useCallback((t, n, e) => {
    localStorage.setItem('token', t)
    localStorage.setItem('name', n || '')
    localStorage.setItem('email', e || '')
    setToken(t)
    setName(n || '')
    setEmail(e || '')
  }, [])
  
  const logout = useCallback(async () => {
    try { await apiCall('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch { }
    localStorage.removeItem('token')
    localStorage.removeItem('name')
    localStorage.removeItem('email')
    setToken(null)
    setName(null)
    setEmail(null)
  }, [token])
  
  return { token, name, email, login, logout }
}

function AppShell({ children, themeKey, setThemeKey, isAuthenticated }) {
  const theme = useMemo(() => buildTheme(themeKey), [themeKey])
  const location = useLocation()

  // Don't show app bar for dashboard and agents routes - they have their own navigation
  const isDashboard = location.pathname.startsWith('/dashboard')
  const isAgents = location.pathname.startsWith('/agents')

  if (isDashboard || isAgents) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" sx={{ background: theme.custom.appBarGradient, backgroundSize: '200% 200%', animation: 'appBarShift 12s ease infinite' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, color: '#ffffff', fontWeight: 600 }}>GIA</Typography>
          <IconButton
            color="inherit"
            onClick={() => setThemeKey(getThemeKeyForMode(theme.palette.mode === 'dark' ? 'light' : 'dark'))}
            aria-label="toggle theme"
            sx={{ ml: 2 }}
          >
            {theme.palette.mode === 'dark' ? <Brightness7Icon size={18} /> : <Brightness4Icon size={18} />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: theme.custom.layout.pageY }}>
        {children}
      </Container>
    </ThemeProvider>
  )
}

export default function App() {
  // removed debug render log
  
  const [themeKey, setThemeKey] = useState(() => {
    const savedKey = localStorage.getItem('theme')
    if (savedKey) return savedKey
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    return getThemeKeyForMode(systemDark ? 'dark' : 'light')
  })
  const auth = useAuth()

  // Memoize user object to prevent unnecessary re-renders
  const user = useMemo(() => ({ 
    name: auth.name, 
    token: auth.token 
  }), [auth.name, auth.token])

  // Save theme preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('theme', themeKey)
    // Also store palette mode for key-agnostic early boot
    try {
      const mode = themeKey === 'aurora' ? 'dark' : 'light'
      localStorage.setItem('theme_mode', mode)
    } catch { }
    // Keep document background in sync to avoid flashes when toggling
    const dark = themeKey === 'aurora'
    const theme = buildTheme(themeKey)
    const bg = theme.custom.backgroundGradient
    const tc = dark ? 'dark' : 'light'
    try {
      document.documentElement.style.backgroundColor = bg
      document.documentElement.style.colorScheme = tc
      if (document.body) document.body.style.backgroundColor = bg
      let meta = document.querySelector('meta[name="theme-color"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'theme-color')
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', bg)
    } catch { }
  }, [themeKey])

  // React to OS color scheme changes when user hasn't explicitly chosen a theme key
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
    if (!mq) return
    const handler = (e) => {
      const savedKey = localStorage.getItem('theme')
      // Only auto-switch if user hasn't chosen explicitly (no saved key) or saved key was set via system before
      if (!savedKey) {
        setThemeKey(getThemeKeyForMode(e.matches ? 'dark' : 'light'))
      }
    }
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler)
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler)
    }
  }, [])

  return (
    <AppShell themeKey={themeKey} setThemeKey={setThemeKey} isAuthenticated={!!auth.token}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!auth.token ? <LoginPage onLogin={auth.login} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={!auth.token ? <SignupPage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallback onLogin={auth.login} />} />

        {/* Dashboard - handles all authenticated routes */}
        <Route path="/dashboard/*" element={auth.token ? <Dashboard user={user} onLogout={auth.logout} themeKey={themeKey} setThemeKey={setThemeKey} /> : <Navigate to="/login" replace />} />

        {/* Simple redirects */}
        <Route path="/" element={<Navigate to={auth.token ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </AppShell>
  )
}
