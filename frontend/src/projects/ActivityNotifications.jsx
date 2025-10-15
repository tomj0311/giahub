import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Popper,
  Paper,
  ClickAwayListener,
  Divider
} from '@mui/material'
import { Send, Paperclip, X, Download } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

// GLOBAL user cache to prevent duplicate user loads
let globalUserCache = null
let globalUserCacheLoading = false

function ActivityNotifications({ user, activityId, projectId }) {
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()
  
  console.log('[NOTIFICATION RENDER]', { activityId, hasToken: !!token, projectId })
  
  const [message, setMessage] = useState('')
  const [mentionedUsers, setMentionedUsers] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([]) // Files selected but not yet uploaded
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [imagePreviews, setImagePreviews] = useState({}) // Store blob URLs for image previews
  
  // User mention autocomplete
  const [allUsers, setAllUsers] = useState([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [anchorEl, setAnchorEl] = useState(null)
  const [cursorPosition, setCursorPosition] = useState(0)
  
  const textFieldRef = useRef(null)
  const fileInputRef = useRef(null)

  // Load users for mentions
  useEffect(() => {
    if (!token) return
    
    // Check global cache first
    if (globalUserCache) {
      console.log('[ACTIVITYNOTIFICATIONS] Using globally cached users')
      setAllUsers(globalUserCache)
      return
    }
    
    // Check if already loading globally
    if (globalUserCacheLoading) {
      console.log('[ACTIVITYNOTIFICATIONS] Users already loading globally, waiting...')
      // Wait for the load to complete
      const checkInterval = setInterval(() => {
        if (!globalUserCacheLoading && globalUserCache) {
          clearInterval(checkInterval)
          console.log('[ACTIVITYNOTIFICATIONS] Global load complete, using cached users')
          setAllUsers(globalUserCache)
        }
      }, 50)
      
      // Cleanup after 5 seconds max
      setTimeout(() => clearInterval(checkInterval), 5000)
      return
    }
    
    console.log('[ACTIVITYNOTIFICATIONS] Loading users for mentions...')
    globalUserCacheLoading = true
    
    const loadUsers = async () => {
      try {
        console.log('[ACTIVITYNOTIFICATIONS] Making API call to /api/users/')
        const res = await apiCall('/api/users/', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        console.log('[ACTIVITYNOTIFICATIONS] /api/users/ response status:', res.status)
        if (!res.ok) return

        const users = await res.json()
        const mappedUsers = users.map(u => ({
          id: u.id,
          email: u.email,
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
        }))
        
        // Cache globally
        globalUserCache = mappedUsers
        setAllUsers(mappedUsers)
      } catch (error) {
        console.error('Error loading users:', error)
      } finally {
        globalUserCacheLoading = false
      }
    }

    loadUsers()
  }, [token]) // Only load once when token is available

  // Load existing notifications
  useEffect(() => {
    if (!activityId || !token) return
    
    const loadNotifications = async () => {
      console.log('[NOTIFICATION] 📡 Fetching notifications from database for activity:', activityId)
      setLoading(true)
      
      try {
        const res = await apiCall(`/api/projects/activities/${activityId}/notifications`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        console.log('[NOTIFICATION] Load response status:', res.status)

        if (res.ok) {
          const data = await res.json()
          console.log('[NOTIFICATION] ✅ Loaded notifications:', data)
          console.log('[NOTIFICATION] ✅ Notification count:', data.notifications?.length || 0)
          setNotifications(data.notifications || [])
        } else {
          const error = await res.json()
          console.error('[NOTIFICATION] ❌ Load error:', error)
        }
      } catch (error) {
        console.error('[NOTIFICATION] ❌ Error loading notifications:', error)
      } finally {
        setLoading(false)
      }
    }

    loadNotifications()
  }, [activityId, token]) // Reload whenever activityId or token changes

  // Load image previews for notifications with image files
  useEffect(() => {
    if (!notifications.length || !token) return
    
    const loadImagePreviews = async () => {
      const newPreviews = {}
      
      for (const notification of notifications) {
        if (!notification.files) continue
        
        for (const file of notification.files) {
          const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.filename)
          if (!isImage) continue
          
          const cacheKey = file.path
          if (imagePreviews[cacheKey]) continue // Already loaded
          
          try {
            const res = await apiCall(`/api/download/${file.path}`, {
              method: 'GET',
              headers: { Authorization: `Bearer ${token}` }
            })
            
            if (res.ok) {
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              newPreviews[cacheKey] = url
            }
          } catch (error) {
            console.error('Failed to load image preview:', error)
          }
        }
      }
      
      if (Object.keys(newPreviews).length > 0) {
        setImagePreviews(prev => ({ ...prev, ...newPreviews }))
      }
    }
    
    loadImagePreviews()
    
    // Cleanup blob URLs on unmount
    return () => {
      Object.values(imagePreviews).forEach(url => URL.revokeObjectURL(url))
    }
  }, [notifications, token])

  // Handle text input changes and detect @ mentions
  const handleMessageChange = (e) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    
    setMessage(value)
    setCursorPosition(cursorPos)

    // Check for @ mention
    const textBeforeCursor = value.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const searchText = textBeforeCursor.substring(lastAtIndex + 1)
      
      // Check if there's a space after @
      if (!searchText.includes(' ')) {
        setMentionSearch(searchText.toLowerCase())
        setShowMentions(true)
        setAnchorEl(textFieldRef.current)
        return
      }
    }
    
    setShowMentions(false)
  }

  // Select a user from mention dropdown
  const selectMention = (user) => {
    const textBeforeCursor = message.substring(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    const textAfterCursor = message.substring(cursorPosition)
    
    const newMessage = 
      message.substring(0, lastAtIndex) + 
      `@${user.name} ` + 
      textAfterCursor

    setMessage(newMessage)
    setMentionedUsers(prev => {
      if (!prev.find(u => u.id === user.id)) {
        return [...prev, user]
      }
      return prev
    })
    
    setShowMentions(false)
    textFieldRef.current?.focus()
  }

  // Remove mentioned user
  const removeMention = (userId) => {
    setMentionedUsers(prev => prev.filter(u => u.id !== userId))
  }

  // Handle file selection (not upload yet)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    if (!activityId) {
      showError('Please save the activity first before attaching files')
      return
    }

    // Just add to selected files, don't upload yet
    setSelectedFiles(prev => [...prev, ...files])
    
    // Clear the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Remove selected file (before sending)
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Send notification - Upload files first, then create notification
  const handleSend = async () => {
    if (!message.trim() && selectedFiles.length === 0) {
      showError('Please enter a message or attach files')
      return
    }

    if (!activityId) {
      showError('Please save the activity first')
      return
    }

    console.log('[NOTIFICATION] Starting send process', { activityId, message, selectedFiles: selectedFiles.length })

    setSending(true)
    try {
      let uploadedFilePaths = []
      
      // Upload files first if any selected
      if (selectedFiles.length > 0) {
        console.log('[NOTIFICATION] Uploading files...', selectedFiles.length)
        const formData = new FormData()
        selectedFiles.forEach(file => formData.append('files', file))

        // Upload to projects/projectId/activityId/
        const uploadPath = `projects/${projectId}/${activityId}`
        const uploadRes = await apiCall(`/api/upload/${uploadPath}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })

        if (!uploadRes.ok) {
          throw new Error('Failed to upload files')
        }

        const uploadResult = await uploadRes.json()
        uploadedFilePaths = uploadResult.files || []
        console.log('[NOTIFICATION] Files uploaded:', uploadedFilePaths)
      }

      // Create notification with uploaded file paths
      const payload = {
        message: message.trim(),
        mentioned_users: mentionedUsers.map(u => u.email),
        files: uploadedFilePaths.map(f => ({
          filename: f.filename,
          path: f.path
        }))
      }

      console.log('[NOTIFICATION] Creating notification with payload:', payload)

      const res = await apiCall(`/api/projects/activities/${activityId}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      console.log('[NOTIFICATION] Response status:', res.status)

      if (!res.ok) {
        const error = await res.json()
        console.error('[NOTIFICATION] Error response:', error)
        throw new Error(error.detail || 'Failed to send notification')
      }

      const result = await res.json()
      console.log('[NOTIFICATION] Success response:', result)
      console.log('[NOTIFICATION] Notification object:', result.notification)
      
      // Add new notification to list immediately for instant feedback
      setNotifications(prev => {
        console.log('[NOTIFICATION] Previous notifications:', prev)
        console.log('[NOTIFICATION] Adding to notifications list. Current count:', prev.length)
        const updated = [result.notification, ...prev]
        console.log('[NOTIFICATION] New notifications array:', updated)
        return updated
      })
      
      // Reset form
      setMessage('')
      setMentionedUsers([])
      setSelectedFiles([])
      
      showSuccess('Notification sent successfully')
    } catch (error) {
      console.error('[NOTIFICATION] Error:', error)
      showError(error.message || 'Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  // Filter users for mention dropdown
  const filteredUsers = allUsers.filter(u => 
    u.name.toLowerCase().includes(mentionSearch) ||
    u.email.toLowerCase().includes(mentionSearch)
  ).slice(0, 5)

  // Don't render anything if no activityId
  if (!activityId) {
    return null
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Notifications
        </Typography>

        {/* Input Area */}
        <Box sx={{ mb: 2 }}>
          {/* Mentioned Users */}
          {mentionedUsers.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {mentionedUsers.map(user => (
                <Chip
                  key={user.id}
                  label={user.name}
                  size="small"
                  onDelete={() => removeMention(user.id)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
          )}

          {/* Message Input */}
          <TextField
            ref={textFieldRef}
            fullWidth
            multiline
            rows={3}
            placeholder="Type @ to mention users, attach files, and send notifications..."
            value={message}
            onChange={handleMessageChange}
            disabled={!activityId || sending}
            sx={{ mb: 2 }}
          />

          {/* Mention Dropdown */}
          {showMentions && filteredUsers.length > 0 && (
            <Popper open={showMentions} anchorEl={anchorEl} placement="bottom-start" style={{ zIndex: 1300 }}>
              <ClickAwayListener onClickAway={() => setShowMentions(false)}>
                <Paper elevation={3} sx={{ maxHeight: 200, overflow: 'auto', minWidth: 250 }}>
                  <List dense>
                    {filteredUsers.map(user => (
                      <ListItem
                        key={user.id}
                        button
                        onClick={() => selectMention(user)}
                      >
                        <ListItemText
                          primary={user.name}
                          secondary={user.email}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </ClickAwayListener>
            </Popper>
          )}

          {/* Selected Files (not uploaded yet) */}
          {selectedFiles.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {selectedFiles.map((file, index) => (
                <Chip
                  key={index}
                  label={file.name}
                  size="small"
                  onDelete={() => removeFile(index)}
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <Button
                startIcon={<Paperclip size={18} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={!activityId || loading || sending}
                size="small"
              >
                Attach Files
              </Button>
            </Box>
            
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} /> : <Send size={18} />}
              onClick={handleSend}
              disabled={!activityId || sending || (!message.trim() && selectedFiles.length === 0)}
            >
              {sending ? 'Sending...' : 'Send'}
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Notification History */}
        <Typography variant="subtitle2" gutterBottom>
          History
        </Typography>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No notifications yet
          </Typography>
        ) : (
          <List>
            {notifications.map((notification, index) => {
              // Get current user email from localStorage
              const currentUserEmail = localStorage.getItem('email')
              const isCurrentUser = notification.sender_email === currentUserEmail
              
              return (
                <React.Fragment key={notification.id || index}>
                  <ListItem 
                    alignItems="flex-start" 
                    sx={{ 
                      px: 0,
                      flexDirection: isCurrentUser ? 'row-reverse' : 'row',
                      justifyContent: isCurrentUser ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <ListItemText
                      sx={{
                        textAlign: isCurrentUser ? 'right' : 'left',
                        p:2
                      }}
                      primary={
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 1, 
                          mb: 0.5,
                          justifyContent: isCurrentUser ? 'flex-end' : 'flex-start'
                        }}>
                          <Typography variant="body2" fontWeight="medium">
                            {notification.sender_name || notification.sender_email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {notification.created_at ? new Date(notification.created_at).toLocaleString() : 'Just now'}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                            {notification.message}
                          </Typography>
                          
                          {notification.mentioned_users?.length > 0 && (
                            <Box sx={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: 0.5, 
                              mb: 1,
                              justifyContent: isCurrentUser ? 'flex-end' : 'flex-start'
                            }}>
                              {notification.mentioned_users.map((email, i) => (
                                <Chip key={i} label={email} size="small" variant="outlined" />
                              ))}
                            </Box>
                          )}
                          
                          {notification.files?.length > 0 && (
                            <Box sx={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: 1,
                              justifyContent: isCurrentUser ? 'flex-end' : 'flex-start'
                            }}>
                              {notification.files.map((file, i) => {
                                const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.filename)
                                const imageUrl = imagePreviews[file.path]
                                
                                const handleDownload = async () => {
                                  try {
                                    const res = await apiCall(`/api/download/${file.path}`, {
                                      method: 'GET',
                                      headers: { Authorization: `Bearer ${token}` }
                                    })
                                    
                                    if (!res.ok) {
                                      showError('Failed to download file')
                                      return
                                    }
                                    
                                    const blob = await res.blob()
                                    const url = window.URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = file.filename
                                    document.body.appendChild(a)
                                    a.click()
                                    window.URL.revokeObjectURL(url)
                                    document.body.removeChild(a)
                                  } catch (error) {
                                    console.error('Download error:', error)
                                    showError('Failed to download file')
                                  }
                                }
                                
                                if (isImage && imageUrl) {
                                  return (
                                    <Box
                                      key={i}
                                      sx={{
                                        position: 'relative',
                                        cursor: 'pointer',
                                        borderRadius: 1,
                                        overflow: 'hidden',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        '&:hover .download-overlay': {
                                          opacity: 1
                                        }
                                      }}
                                      onClick={handleDownload}
                                    >
                                      <img
                                        src={imageUrl}
                                        alt={file.filename}
                                        style={{
                                          maxWidth: '200px',
                                          maxHeight: '150px',
                                          display: 'block',
                                          objectFit: 'cover'
                                        }}
                                      />
                                      <Box
                                        className="download-overlay"
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          opacity: 0,
                                          transition: 'opacity 0.2s'
                                        }}
                                      >
                                        <Download size={24} color="white" />
                                      </Box>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          position: 'absolute',
                                          bottom: 0,
                                          left: 0,
                                          right: 0,
                                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                          color: 'white',
                                          padding: '4px 8px',
                                          fontSize: '0.7rem',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }}
                                      >
                                        {file.filename}
                                      </Typography>
                                    </Box>
                                  )
                                }
                                
                                return (
                                  <Chip
                                    key={i}
                                    label={file.filename}
                                    size="small"
                                    icon={<Download size={14} />}
                                    onClick={handleDownload}
                                  />
                                )
                              })}
                            </Box>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < notifications.length - 1 && <Divider />}
                </React.Fragment>
              )
            })}
          </List>
        )}
      </CardContent>
    </Card>
  )
}

// Memoize with custom comparison to prevent unnecessary re-renders
// Only re-render when activityId or token changes, NOT when projectId changes
export default React.memo(ActivityNotifications, (prevProps, nextProps) => {
  const shouldSkipRender = (
    prevProps.activityId === nextProps.activityId &&
    prevProps.user?.token === nextProps.user?.token &&
    prevProps.projectId === nextProps.projectId
  )
  
  if (!shouldSkipRender) {
    console.log('[NOTIFICATION MEMO] Props changed, will re-render:', {
      activityIdChanged: prevProps.activityId !== nextProps.activityId,
      tokenChanged: prevProps.user?.token !== nextProps.user?.token,
      projectIdChanged: prevProps.projectId !== nextProps.projectId
    })
  }
  
  return shouldSkipRender
})
