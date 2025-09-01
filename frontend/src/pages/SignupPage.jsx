import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Grid from '@mui/material/Grid2'
import PasswordField from '../components/PasswordField'
import { useSnackbar } from '../contexts/SnackbarContext'

export default function SignupPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { showError, showSuccess } = useSnackbar()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const resp = await fetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, confirmPassword })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Registration failed')
      showSuccess('Account created. Check your email to verify your account.', 8000)
      setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setConfirmPassword('')
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Paper variant="card" sx={{ p: 3 }} component="form" onSubmit={submit}>
      <Typography variant="h4" sx={{ mb: 2 }}>Create your account</Typography>
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
        <Button type="submit" variant="contained" size="medium" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</Button>
      </Stack>
    </Paper>
  )
}
