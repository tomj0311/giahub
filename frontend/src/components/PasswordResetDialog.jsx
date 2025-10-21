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
import InputAdornment from '@mui/material/InputAdornment'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

export default function PasswordResetDialog({ open, onClose, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { showError, showSuccess } = useSnackbar()

  const handleClose = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(false)
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (newPassword !== confirmPassword) {
      showError('New password and confirm password do not match')
      return
    }
    
    if (newPassword.length < 8) {
      showError('New password must be at least 8 characters long')
      return
    }
    
    if (currentPassword === newPassword) {
      showError('New password must be different from current password')
      return
    }
    
    setLoading(true)
    
    try {
      await apiCall('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })
      
      setSuccess(true)
      showSuccess('Password changed successfully! Logging out...', 4000)
      
      // Auto close after 2 seconds and logout
      setTimeout(() => {
        handleClose()
        if (onLogout) {
          onLogout()
        }
      }, 2000)
    } catch (err) {
      showError(err.message || 'Failed to change password. Please try again.')
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
          {success ? 'Password Changed' : 'Change Password'}
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
            <Typography variant="body1" align="center" color="text.primary">
              Your password has been changed successfully!
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary">
              You will be logged out and redirected to the login page.
            </Typography>
          </Stack>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2.5}>
              <Typography variant="body2" color="text.secondary">
                Enter your current password and choose a new password for your account.
              </Typography>
              
              <TextField
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        edge="end"
                        size="small"
                      >
                        {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <TextField
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                fullWidth
                helperText="Must be at least 8 characters long"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                        size="small"
                      >
                        {showNewPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <TextField
                label="Confirm New Password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                fullWidth
                error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                helperText={
                  confirmPassword.length > 0 && newPassword !== confirmPassword
                    ? 'Passwords do not match'
                    : ''
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                        size="small"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
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
              {loading ? 'Changing...' : 'Change Password'}
            </Button>
          </DialogActions>
        </form>
      )}

      {success && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} variant="contained" fullWidth>
            Done
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
