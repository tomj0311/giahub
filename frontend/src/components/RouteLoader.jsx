import React from 'react'
import { Box } from '@mui/material'

// Minimal placeholder-only loader (no skeletons) to avoid visual inconsistency
export default function RouteLoader({ duration = 500, minHeight = 200 }) {
  return (
    <Box
      aria-busy
      sx={{
        width: '100%',
        minHeight,
        '@keyframes loaderIn': {
          from: { opacity: 0, transform: 'translateY(6px)', filter: 'blur(1px)' },
          to: { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
        },
        opacity: 0,
        transform: 'translateY(6px)',
        animation: `loaderIn ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
        animationFillMode: 'both'
      }}
    />
  )
}
