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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall, API_BASE_URL } from '../config/api'

export default function PasswordResetDialog({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { showError, showSuccess } = useSnackbar()

  const handleClose = () => {
    setEmail('')
    setSent(false)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Use direct fetch to avoid 401 redirect issues
      const resp = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      if (resp.ok) {
        setSent(true)
        showSuccess('Password reset email sent. Please check your inbox.', 6000)
      } else {
        const errorData = await resp.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to send reset email')
      }
    } catch (err) {
      showError(err.message || 'An error occurred. Please try again.')
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
          {sent ? 'Check your email' : 'Reset password'}
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

      {sent ? (
        <DialogContent>
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CheckCircleOutlineIcon 
              sx={{ 
                fontSize: 64, 
                color: 'success.main',
                mb: 1
              }} 
            />
            <Typography variant="body1" align="center" color="text.primary">
              We've sent a password reset link to
            </Typography>
            <Typography variant="subtitle1" align="center" fontWeight={600}>
              {email}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary" sx={{ maxWidth: 400 }}>
              If you don't see the email, check your spam folder or try again with a different email address.
            </Typography>
          </Stack>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Enter the email address associated with your account and we'll send you a link to reset your password.
              </Typography>
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                fullWidth
                placeholder="your@email.com"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
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
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </DialogActions>
        </form>
      )}

      {sent && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} variant="contained" fullWidth>
            Done
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
