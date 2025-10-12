import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Container,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Key as KeyIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [searchParams] = useSearchParams()
  const { showError, showSuccess } = useSnackbar()
  const navigate = useNavigate()

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      showError('Invalid or missing verification token')
      navigate('/login')
    }
  }, [token, navigate, showError])

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long'
    }
    return null
  }

  const validateConfirmPassword = (password, confirmPassword) => {
    if (password !== confirmPassword) {
      return 'Passwords do not match'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const passwordError = validatePassword(password)
    if (passwordError) {
      showError(passwordError)
      return
    }

    const confirmPasswordError = validateConfirmPassword(password, confirmPassword)
    if (confirmPasswordError) {
      showError(confirmPasswordError)
      return
    }

    setLoading(true)
    try {
      const response = await apiCall('/api/users/set-password-invited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to set password')
      }

      setSuccess(true)
      showSuccess(data.message || 'Password set successfully! You can now log in.')
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login')
      }, 3000)

    } catch (err) {
      showError(err.message || 'Failed to set password')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom color="success.main">
            Account Setup Complete!
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Your password has been set successfully. Your account is now active and you can log in.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Redirecting to login page in 3 seconds...
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/login')}
            fullWidth
          >
            Go to Login
          </Button>
        </Paper>
      </Container>
    )
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <KeyIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Set Your Password
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Complete your account setup by creating a secure password
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Welcome to GIA!</strong> You've been invited to join the platform. 
            Please set a secure password to complete your account setup.
          </Typography>
        </Alert>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            helperText="Password must be at least 8 characters long"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            label="Confirm Password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            margin="normal"
            required
            error={confirmPassword && password !== confirmPassword}
            helperText={
              confirmPassword && password !== confirmPassword
                ? 'Passwords do not match'
                : 'Re-enter your password to confirm'
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    edge="end"
                  >
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading || !password || !confirmPassword}
            sx={{ mt: 3, mb: 2 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Set Password & Activate Account'
            )}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Need help? Contact your administrator who sent the invitation.
          </Typography>
        </Box>
      </Paper>
    </Container>
  )
}