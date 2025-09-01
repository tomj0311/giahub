import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import PasswordField from '../components/PasswordField'
import { useSnackbar } from '../contexts/SnackbarContext'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { showError } = useSnackbar()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Try admin/user login via /auth/login
      const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (resp.ok) {
        const data = await resp.json()
        onLogin(data.token, data.name)
        return
      }
      // Fallback to /users/login (requires verified user)
      const resp2 = await fetch('/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      })
      if (!resp2.ok) {
        const msg = (await resp2.json()).detail || 'Login failed'
        throw new Error(msg)
      }
      const user = await resp2.json()
      // /users/login does not return JWT; call /auth/login for token
      const tokenResp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!tokenResp.ok) throw new Error('Token issuance failed')
      const tokenData = await tokenResp.json()
      onLogin(tokenData.token, user.name)
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = () => {
    window.location.href = '/auth/google'
  }

  return (
    <Paper variant="card" sx={{ p: 3 }} component="form" onSubmit={submit}>
      <Typography variant="h4" sx={{ mb: 2 }}>Welcome back</Typography>
      <Stack spacing={2}>
        <TextField label="Email or username" value={username} onChange={e => setUsername(e.target.value)} required />
        <PasswordField label="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Button type="submit" variant="contained" size="medium" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
        <Divider>or</Divider>
        <Button variant="outlined" size="medium" onClick={loginWithGoogle}>Continue with Google</Button>
      </Stack>
    </Paper>
  )
}
