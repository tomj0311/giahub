import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import PasswordField from '../components/PasswordField'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showError, showSuccess } = useSnackbar()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')

  useEffect(() => {
    const tokenParam = searchParams.get('token')
    if (!tokenParam) {
      showError('Invalid reset link')
      navigate('/login')
      return
    }
    setToken(tokenParam)
  }, [searchParams, navigate, showError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!password || !confirmPassword) {
      showError('Please fill in all fields')
      return
    }
    
    if (password !== confirmPassword) {
      showError('Passwords do not match')
      return
    }
    
    if (password.length < 8) {
      showError('Password must be at least 8 characters')
      return
    }
    
    setLoading(true)
    
    try {
      await apiCall('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      })
      
      showSuccess('Password reset successfully! You can now log in.')
      navigate('/login')
    } catch (err) {
      showError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'background.default'
    }}>
      <Container maxWidth="sm">
        <Paper variant="card" sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Reset Your Password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your new password below
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <PasswordField 
                label="New Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                helperText="At least 8 characters" 
              />
              <PasswordField 
                label="Confirm Password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
              />
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button 
                  type="submit" 
                  variant="contained" 
                  size="large"
                  disabled={loading}
                  sx={{ minWidth: 200 }}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </Box>
            </Stack>
          </form>
        </Paper>
      </Container>
    </Box>
  )
}