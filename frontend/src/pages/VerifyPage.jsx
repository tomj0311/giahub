import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

export default function VerifyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showError, showSuccess } = useSnackbar()
  const [status, setStatus] = useState('verifying') // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided')
      return
    }

    verifyEmail(token)
  }, [searchParams])

  const verifyEmail = async (token) => {
    try {
      setStatus('verifying')
      const response = await apiCall('/api/users/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      if (response.ok) {
        const data = await response.json()
        setStatus('success')
        setMessage(data.message || 'Email verified successfully!')
        showSuccess('Email verified successfully! You can now log in.')
      } else {
        const errorData = await response.json()
        setStatus('error')
        setMessage(errorData.detail || 'Verification failed')
        showError(errorData.detail || 'Verification failed')
      }
    } catch (error) {
      console.error('Verification error:', error)
      setStatus('error')
      setMessage('An error occurred during verification')
      showError('An error occurred during verification')
    }
  }

  const handleGoToLogin = () => {
    navigate('/login')
  }

  const renderContent = () => {
    switch (status) {
      case 'verifying':
        return (
          <Stack spacing={3} alignItems="center">
            <CircularProgress size={60} />
            <Typography variant="h5">Verifying your email...</Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              Please wait while we verify your email address.
            </Typography>
          </Stack>
        )

      case 'success':
        return (
          <Stack spacing={3} alignItems="center">
            <CheckCircleIcon sx={{ fontSize: 60, color: 'success.main' }} />
            <Typography variant="h5" color="success.main">Email Verified!</Typography>
            <Alert severity="success" sx={{ width: '100%' }}>
              {message}
            </Alert>
            <Typography variant="body1" color="text.secondary" align="center">
              Your email has been successfully verified. You can now log in to your account.
            </Typography>
            <Button 
              variant="contained" 
              size="large" 
              onClick={handleGoToLogin}
              sx={{ mt: 2 }}
            >
              Go to Login
            </Button>
          </Stack>
        )

      case 'error':
        return (
          <Stack spacing={3} alignItems="center">
            <ErrorIcon sx={{ fontSize: 60, color: 'error.main' }} />
            <Typography variant="h5" color="error.main">Verification Failed</Typography>
            <Alert severity="error" sx={{ width: '100%' }}>
              {message}
            </Alert>
            <Typography variant="body2" color="text.secondary" align="center">
              The verification link may be invalid or expired. Please try signing up again or contact support.
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button 
                variant="outlined" 
                onClick={() => navigate('/signup')}
              >
                Sign Up Again
              </Button>
              <Button 
                variant="contained" 
                onClick={handleGoToLogin}
              >
                Try Login
              </Button>
            </Stack>
          </Stack>
        )

      default:
        return null
    }
  }

  return (
    <Paper variant="card" sx={{ p: 4, maxWidth: 500, mx: 'auto', mt: 8 }}>
      <Stack spacing={3}>
        <Typography variant="h4" align="center" gutterBottom>
          Email Verification
        </Typography>
        {renderContent()}
      </Stack>
    </Paper>
  )
}
