import React, { useState, useEffect } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import GoogleIcon from '@mui/icons-material/Google'
import Grid from '@mui/material/Grid2'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import { Moon as Brightness4Icon, Sun as Brightness7Icon } from 'lucide-react'
import { useTheme } from '@mui/material/styles'
import PasswordField from '../components/PasswordField'
import PasswordResetDialog from '../components/PasswordResetDialog'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall, API_BASE_URL } from '../config/api'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getThemeKeyForMode } from '../theme'

// Microsoft icon as SVG component
const MicrosoftIcon = (props) => (
  <svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M1 1h10v10H1V1z" fill="#f25022"/>
    <path d="M12 1h10v10H12V1z" fill="#7fba00"/>
    <path d="M1 12h10v10H1V12z" fill="#00a4ef"/>
    <path d="M12 12h10v10H12V12z" fill="#ffb900"/>
  </svg>
)

export default function LoginPage({ onLogin, themeKey, setThemeKey }) {
  const theme = useTheme()
  const [isSignup, setIsSignup] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const { showError, showSuccess } = useSnackbar()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Check for error parameter from OAuth redirect
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      showError(decodeURIComponent(error))
      // Clean up URL by removing error parameter
      navigate('/login', { replace: true })
    }
  }, [searchParams, showError, navigate])

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
        onLogin(data.token, data.name, username)
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
      const resp = await apiCall('/api/users/', {
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
            Welcome to GIA
          </Typography>
          <Typography variant="h5" sx={{ opacity: 0.9 }}>
            Your intelligent assistant platform
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
          <Paper variant="card" sx={{ p: 4 }}>
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
                  <Box>
                    <PasswordField 
                      label="Password" 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      required 
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                      <Button 
                        variant="text" 
                        size="small"
                        onClick={() => setShowPasswordReset(true)}
                        sx={{ 
                          textTransform: 'none', 
                          p: 0.5,
                          minWidth: 'auto',
                          fontSize: '0.875rem',
                          color: 'primary.main',
                          '&:hover': {
                            backgroundColor: 'transparent',
                            textDecoration: 'underline'
                          }
                        }}
                      >
                        Forgot password?
                      </Button>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Button 
                      type="submit" 
                      variant="contained" 
                      size="large"
                      disabled={loading}
                      sx={{ minWidth: 200 }}
                    >
                      {loading ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </Box>
                  <Divider>or</Divider>
                  <Stack spacing={2} alignItems="center">
                    <Button 
                      type="button" 
                      variant="outlined" 
                      size="large"
                      onClick={loginWithGoogle}
                      sx={{ 
                        minWidth: 250,
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
                      Continue with Google
                    </Button>
                    <Button 
                      type="button" 
                      variant="outlined" 
                      size="large"
                      onClick={loginWithMicrosoft}
                      sx={{ 
                        minWidth: 250,
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
                      Continue with Microsoft
                    </Button>
                  </Stack>
                </Stack>
              </form>
            )}

            <PasswordResetDialog 
              open={showPasswordReset} 
              onClose={() => setShowPasswordReset(false)} 
            />
          </Paper>
        </Container>
      </Box>
    </Box>
  )
}
