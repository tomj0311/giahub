import React, { useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import GoogleIcon from '@mui/icons-material/Google'
import Grid from '@mui/material/Grid2'
import Box from '@mui/material/Box'
import PasswordField from '../components/PasswordField'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall, API_BASE_URL } from '../config/api'

// Microsoft icon as SVG component
const MicrosoftIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1 1h10v10H1V1z" fill="#f25022"/>
    <path d="M12 1h10v10H12V1z" fill="#7fba00"/>
    <path d="M1 12h10v10H1V12z" fill="#00a4ef"/>
    <path d="M12 12h10v10H12V12z" fill="#ffb900"/>
  </svg>
)

export default function LoginPage({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { showError, showSuccess } = useSnackbar()

  const resetForm = () => {
    setUsername('')
    setPassword('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setConfirmPassword('')
  }

  const toggleMode = () => {
    setIsSignup(!isSignup)
    resetForm()
  }

  const submitLogin = async (e) => {
    if (e) {
      e.preventDefault()
    }
    setLoading(true)
    try {
      // Use direct fetch for login to avoid automatic 401 handling
      const resp = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      })
      
      if (resp.ok) {
        const data = await resp.json()
        onLogin(data.token, data.name)
        return
      }
      
      // Handle authentication errors
      let errorMessage = 'Login failed. Please try again.'
      
      try {
        const errorData = await resp.json()
        errorMessage = errorData.detail || errorMessage
      } catch (parseError) {
        // swallowed parse error
      }
      
      showError(errorMessage)
      
    } catch (err) {
      // removed login error debug log
      showError(err.message || 'An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  const submitSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const resp = await apiCall('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, confirmPassword })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Registration failed')
      showSuccess('Account created. Check your email to verify your account.', 8000)
      resetForm()
    } catch (err) {
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE_URL}/auth/google`
  }

  const loginWithMicrosoft = () => {
    window.location.href = `${API_BASE_URL}/auth/microsoft`
  }

  return (
    <Paper variant="card" sx={{ p: 3 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 2 }}>
          {isSignup ? 'Create your account' : 'Welcome back'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Button variant="text" onClick={toggleMode} sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}>
            {isSignup ? 'Sign in' : 'Sign up'}
          </Button>
        </Typography>
      </Box>

      {isSignup ? (
        <form onSubmit={submitSignup}>
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid xs={12} sm={6}>
                <TextField 
                  label="First name" 
                  value={firstName} 
                  onChange={e => setFirstName(e.target.value)} 
                  required 
                />
              </Grid>
              <Grid xs={12} sm={6}>
                <TextField 
                  label="Last name" 
                  value={lastName} 
                  onChange={e => setLastName(e.target.value)} 
                />
              </Grid>
            </Grid>
            <TextField 
              label="Email" 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
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
            <Button 
              type="submit" 
              variant="contained" 
              size="medium" 
              disabled={loading} 
              sx={{ alignSelf: 'center' }}
            >
              {loading ? 'Creating…' : 'Create account'}
            </Button>
          </Stack>
        </form>
      ) : (
        <form onSubmit={submitLogin}>
          <Stack spacing={2}>
            <TextField 
              label="Email or username" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
            />
            <PasswordField 
              label="Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
            <Button 
              type="submit" 
              variant="contained" 
              size="medium" 
              disabled={loading} 
              sx={{ alignSelf: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <Divider>or</Divider>
            <Stack direction="row" spacing={2} sx={{ alignSelf: 'center' }}>
              <Button 
                type="button" 
                variant="outlined" 
                size="medium" 
                onClick={loginWithGoogle} 
                sx={{ 
                  color: '#4285f4',
                  borderColor: '#4285f4',
                  '&:hover': {
                    borderColor: '#3367d6',
                    backgroundColor: 'rgba(66, 133, 244, 0.08)',
                    color: '#3367d6'
                  }
                }}
                startIcon={<GoogleIcon sx={{ color: '#4285f4' }} />}
              >
                Google
              </Button>
              <Button 
                type="button" 
                variant="outlined" 
                size="medium" 
                onClick={loginWithMicrosoft} 
                sx={{ 
                  color: '#00a4ef',
                  borderColor: '#00a4ef',
                  '&:hover': {
                    borderColor: '#0078d4',
                    backgroundColor: 'rgba(0, 164, 239, 0.08)',
                    color: '#0078d4'
                  }
                }}
                startIcon={<MicrosoftIcon />}
              >
                Microsoft
              </Button>
            </Stack>
          </Stack>
        </form>
      )}
    </Paper>
  )
}
