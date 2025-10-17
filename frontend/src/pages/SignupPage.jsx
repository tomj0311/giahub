import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Grid from '@mui/material/Grid2'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import { Moon as Brightness4Icon, Sun as Brightness7Icon } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import { Link } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'
import { getThemeKeyForMode } from '../theme'

export default function SignupPage({ themeKey, setThemeKey }) {
  const theme = useTheme()
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
      const resp = await apiCall('/api/users/', {
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
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh',
      width: '100%'
    }}>
      {/* Theme Toggle Button - Fixed Position */}
      <IconButton
        onClick={() => setThemeKey(getThemeKeyForMode(theme.palette.mode === 'dark' ? 'light' : 'dark'))}
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          bgcolor: 'background.paper',
          boxShadow: 2,
          '&:hover': {
            bgcolor: 'action.hover',
          }
        }}
      >
        {theme.palette.mode === 'dark' ? <Brightness7Icon size={20} /> : <Brightness4Icon size={20} />}
      </IconButton>

      {/* Left Section - Image/Animation Area */}
      <Box sx={{ 
        flex: 1,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: 'center',
        p: 4
      }}>
        <Box sx={{ textAlign: 'center', color: 'white' }}>
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
            Join GIA Today
          </Typography>
          <Typography variant="h5" sx={{ opacity: 0.9 }}>
            Create your account and get started
          </Typography>
          {/* Placeholder for future image/animation */}
        </Box>
      </Box>

      {/* Right Section - Form Area */}
      <Box sx={{ 
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        backgroundColor: 'background.default'
      }}>
        <Container maxWidth="sm">
          <Paper variant="card" sx={{ p: 4 }} component="form" onSubmit={submit}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Create your account
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <Button 
                  component={Link}
                  to="/login"
                  variant="text" 
                  sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}
                >
                  Sign in
                </Button>
              </Typography>
            </Box>

            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <TextField 
                    label="First name" 
                    value={firstName} 
                    onChange={e => setFirstName(e.target.value)} 
                    required 
                    fullWidth
                  />
                </Grid>
                <Grid xs={12} sm={6}>
                  <TextField 
                    label="Last name" 
                    value={lastName} 
                    onChange={e => setLastName(e.target.value)} 
                    fullWidth
                  />
                </Grid>
              </Grid>
              <TextField 
                label="Email" 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
                fullWidth
              />
              <PasswordField 
                label="Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                helperText="At least 8 characters" 
              />
              <PasswordField 
                label="Confirm password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
              />
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Button 
                  type="submit" 
                  variant="contained" 
                  size="large"
                  disabled={loading}
                  sx={{ minWidth: 200 }}
                >
                  {loading ? 'Creating…' : 'Create account'}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </Box>
  )
}
