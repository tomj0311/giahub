import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function AuthCallback({ onLogin }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    const name = params.get('name')
    if (token) {
      onLogin(token, name)
    }
    navigate('/', { replace: true })
  }, [])

  return null
}
