import React, { useState } from 'react'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import { Eye as Visibility, EyeOff as VisibilityOff } from 'lucide-react'

export default function PasswordField(props) {
  const [show, setShow] = useState(false)
  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton aria-label="toggle password visibility" onClick={() => setShow(s => !s)} edge="end">
              {show ? <VisibilityOff size={20} /> : <Visibility size={20} />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
  )
}
