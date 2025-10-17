import React, { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import EmailIcon from '@mui/icons-material/Email'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

export default function ForgotPasswordDialog({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { showError } = useSnackbar()

  const handleClose = () => {
    setEmail('')
    setSuccess(false)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email.trim()) {
      showError('Please enter your email address')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      showError('Please enter a valid email address')
      return
    }
    
    setLoading(true)
    
    try {
      await apiCall('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      })
      
      setSuccess(true)
    } catch (err) {
      showError(err.message || 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          p: 1
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6">
          {success ? 'Check Your Email' : 'Reset Password'}
        </Typography>
        <IconButton 
          onClick={handleClose} 
          size="small"
          sx={{ 
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {success ? (
        <DialogContent>
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CheckCircleOutlineIcon 
              sx={{ 
                fontSize: 64, 
                color: 'success.main',
                mb: 1
              }} 
            />
            <Typography variant="h6" align="center" color="text.primary">
              Reset link sent!
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary">
              We've sent a password reset link to
            </Typography>
            <Typography variant="body1" align="center" color="text.primary" sx={{ fontWeight: 500 }}>
              {email}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{ mt: 2 }}>
              Please check your email and click the link to reset your password. 
              If you don't see the email, check your spam folder.
            </Typography>
          </Stack>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2.5}>
              <Stack spacing={1} alignItems="center">
                <EmailIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
                <Typography variant="body1" align="center" color="text.primary">
                  Enter your email address and we'll send you a link to reset your password.
                </Typography>
              </Stack>
              
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                fullWidth
                placeholder="Enter your email address"
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 3, pt: 1 }}>
            <Button 
              onClick={handleClose} 
              variant="text"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={loading || !email.trim()}
              sx={{ minWidth: 120 }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </DialogActions>
        </form>
      )}

      {success && (
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button 
            onClick={handleClose} 
            variant="contained"
            fullWidth
          >
            Done
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}