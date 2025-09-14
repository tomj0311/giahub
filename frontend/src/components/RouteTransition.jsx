import React, { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { useLocation } from 'react-router-dom'

/**
 * Wraps route content with a subtle fade/slide-in animation.
 * Re-triggers on pathname change by keying the wrapper.
 */
export default function RouteTransition({ children, duration = 1000, delay = 320, placeholderMinHeight = 240 }) {
  const location = useLocation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const t = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(t)
  }, [location.pathname, delay])

  return (
    <Box sx={{ width: '100%' }}>
      {!ready && (
        <Box
          aria-hidden
          sx={{
            minHeight: placeholderMinHeight,
            '@keyframes placeholderIn': {
              from: { opacity: 0, transform: 'translateY(6px)', filter: 'blur(1px)' },
              to: { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
            },
            opacity: 0,
            transform: 'translateY(6px)',
            willChange: 'opacity, transform',
            animation: `placeholderIn ${Math.max(300, duration - 400)}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
            animationFillMode: 'both'
          }}
        />
      )}

      {ready && (
        <Box
          sx={{
            '@keyframes subtleIn': {
              from: { opacity: 0, transform: 'translateY(6px)' },
              to: { opacity: 1, transform: 'translateY(0)' }
            },
            opacity: 0,
            transform: 'translateY(6px)',
            willChange: 'opacity, transform',
            animation: `subtleIn ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
            animationFillMode: 'both'
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  )
}
