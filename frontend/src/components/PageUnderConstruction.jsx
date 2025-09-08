import React from 'react'
import {
  Box,
  Typography,
  Button,
  Paper
} from '@mui/material'
import { Construction, ArrowLeft, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PageUnderConstruction() {
  const navigate = useNavigate()

  const handleGoBack = () => {
    navigate(-1)
  }

  const handleGoHome = () => {
    navigate('/dashboard')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        padding: 2
      }}
    >
      <Paper
        elevation={8}
        sx={{
          padding: 6,
          textAlign: 'center',
          maxWidth: 500,
          width: '100%',
          borderRadius: 3,
          bgcolor: 'background.paper'
        }}
      >
        <Box sx={{ mb: 4 }}>
          <Box sx={{ color: 'primary.main', mb: 2 }}>
            <Construction size={80} />
          </Box>
          <Typography 
            variant="h3" 
            component="h1" 
            gutterBottom
            color="primary"
            sx={{ fontWeight: 'bold' }}
          >
            Page Under Construction
          </Typography>
        </Box>

        <Typography 
          variant="h6" 
          color="text.secondary" 
          gutterBottom
          sx={{ mb: 3 }}
        >
          🚧 We're working hard to bring you this feature!
        </Typography>

        <Typography 
          variant="body1" 
          color="text.secondary" 
          sx={{ mb: 4, lineHeight: 1.6 }}
        >
          This page is currently under development. Our team is building something amazing for you. 
          Please check back soon for updates!
        </Typography>

        <Box 
          sx={{ 
            display: 'flex', 
            gap: 2, 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}
        >
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ArrowLeft size={18} />}
            onClick={handleGoBack}
            sx={{ minWidth: 120 }}
          >
            Go Back
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Home size={18} />}
            onClick={handleGoHome}
            sx={{ minWidth: 120 }}
          >
            Go Home
          </Button>
        </Box>

        <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Expected completion: Coming Soon ✨
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}
