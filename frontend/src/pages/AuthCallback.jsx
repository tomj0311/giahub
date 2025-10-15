import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Box, CircularProgress, Typography } from '@mui/material'

export default function AuthCallback({ onLogin }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = params.get('token')
    const name = params.get('name')
    const email = params.get('email')
    
    if (token) {
      try {
        onLogin(token, name, email)
        // Give a small delay to ensure state updates
        setTimeout(() => {
          navigate('/dashboard', { replace: true })
        }, 100)
      } catch (err) {
        setError('Authentication failed')
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 2000)
      }
    } else {
      setError('No authentication token received')
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2000)
    }
  }, [params, onLogin, navigate])

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Typography color="error">{error}</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>Redirecting to login...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <CircularProgress />
      <Typography sx={{ mt: 2 }}>Completing authentication...</Typography>
    </Box>
  )
}
