import React, { useMemo, useState, useEffect } from 'react'
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
import AuthCallback from './pages/AuthCallback'
import Dashboard from './Dashboard/Dashboard'
import { buildTheme } from './theme'

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [name, setName] = useState(() => localStorage.getItem('name'))

  const login = (t, n) => {
    localStorage.setItem('token', t)
    localStorage.setItem('name', n || '')
    setToken(t)
    setName(n || '')
  }
  const logout = async () => {
    try { await fetch('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('name')
    setToken(null)
    setName(null)
  }
  return { token, name, login, logout }
}

function AppShell({ children, themeKey, setThemeKey, isAuthenticated }) {
  const theme = useMemo(() => buildTheme(themeKey), [themeKey])
  const location = useLocation()
  
  // Don't show app bar for dashboard routes - dashboard has its own navigation
  const isDashboard = location.pathname.startsWith('/dashboard')
  
  if (isDashboard) {
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
          <Typography variant="h6" sx={{ flexGrow: 1, color: '#ffffff', fontWeight: 600 }}>GiaHUB</Typography>
          {!isAuthenticated && (
            <>
              <Button color="inherit" component={Link} to="/login">Login</Button>
              <Button color="inherit" component={Link} to="/signup" sx={{ ml: 1 }}>Sign up</Button>
            </>
          )}
          <IconButton color="inherit" onClick={() => setThemeKey(prev => prev === 'aurora' ? 'ocean' : 'aurora')} aria-label="toggle theme" sx={{ ml: 2 }}>
            {themeKey === 'aurora' ? <Brightness7Icon size={18} /> : <Brightness4Icon size={18} />}
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
  const [themeKey, setThemeKey] = useState(() => localStorage.getItem('theme') || 'aurora')
  const auth = useAuth()

  // Save theme preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('theme', themeKey)
  }, [themeKey])

  return (
    <AppShell themeKey={themeKey} setThemeKey={setThemeKey} isAuthenticated={!!auth.token}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={!auth.token ? <LoginPage onLogin={auth.login} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={!auth.token ? <SignupPage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/auth/callback" element={<AuthCallback onLogin={auth.login} />} />
        
        {/* Protected routes */}
        <Route path="/dashboard/*" element={auth.token ? <Dashboard user={{ name: auth.name, token: auth.token }} onLogout={auth.logout} themeKey={themeKey} setThemeKey={setThemeKey} /> : <Navigate to="/login" replace />} />
        
        {/* Default redirects */}
        <Route path="/" element={<Navigate to={auth.token ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={auth.token ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </AppShell>
  )
}
