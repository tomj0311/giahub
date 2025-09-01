import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid2'
import PasswordField from '../components/PasswordField'

export default function SignupPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const resp = await fetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, confirmPassword })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Registration failed')
      setSuccess('Account created. Check your email to verify your account.')
      setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Paper variant="card" sx={{ p: 3 }} component="form" onSubmit={submit}>
      <Typography variant="h4" sx={{ mb: 2 }}>Create your account</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      <Stack spacing={2}>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6}>
            <TextField label="First name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
          </Grid>
          <Grid xs={12} sm={6}>
            <TextField label="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
          </Grid>
        </Grid>
        <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <PasswordField label="Password" value={password} onChange={e => setPassword(e.target.value)} required helperText="At least 8 characters" />
        <PasswordField label="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</Button>
      </Stack>
    </Paper>
  )
}
