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

// GLOBAL cache to prevent duplicate API calls across component mounts
const notificationCache = {
  data: {},
  loading: new Set(),
  
  get(activityId) {
    return this.data[activityId]
  },
  
  set(activityId, notifications) {
    this.data[activityId] = {
      notifications,
      timestamp: Date.now()
    }
  },
  
  isLoading(activityId) {
    return this.loading.has(activityId)
  },
  
  setLoading(activityId, isLoading) {
    if (isLoading) {
      this.loading.add(activityId)
    } else {
      this.loading.delete(activityId)
    }
  },
  
  invalidate(activityId) {
    delete this.data[activityId]
  }
}

// GLOBAL user cache to prevent duplicate user loads
let globalUserCache = null
let globalUserCacheLoading = false
let globalUserCachePromise = null // Store the promise so concurrent loads can await it

function ActivityNotifications({ user, activityId, projectName }) {
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()
  
  // Use refs for values that shouldn't trigger re-renders
  const tokenRef = useRef(token)
  const activityIdRef = useRef(activityId)
  
  console.log('[NOTIFICATION RENDER]', { activityId, hasToken: !!token, projectName })
  
  const [message, setMessage] = useState('')
  const [mentionedUsers, setMentionedUsers] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([]) // Files selected but not yet uploaded
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  
  // User mention autocomplete
  const [allUsers, setAllUsers] = useState([])
  const [showMentions, setShowMentions] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [anchorEl, setAnchorEl] = useState(null)
  const [cursorPosition, setCursorPosition] = useState(0)
  
  const textFieldRef = useRef(null)
  const fileInputRef = useRef(null)
  const hasLoadedRef = useRef(false)
  
  // Update refs when props change
  useEffect(() => {
    tokenRef.current = token
    activityIdRef.current = activityId
  }, [token, activityId])

  // Load users for mentions
  useEffect(() => {
    if (!tokenRef.current) return
    
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
          headers: { Authorization: `Bearer ${tokenRef.current}` }
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
  }, []) // Only load once on mount

  // Load existing notifications
  useEffect(() => {
    if (!activityIdRef.current || !tokenRef.current) return
    
    // CRITICAL: Reset hasLoadedRef when activityId changes
    // This ensures notifications are reloaded for each new activity
    if (hasLoadedRef.current && hasLoadedRef.current !== activityIdRef.current) {
      console.log('[NOTIFICATION] Activity changed from', hasLoadedRef.current, 'to', activityIdRef.current, '- resetting hasLoadedRef')
      hasLoadedRef.current = false
      // CLEAR old notifications immediately when switching activities
      setNotifications([])
    }
    
    // Check if already loading globally
    if (notificationCache.isLoading(activityIdRef.current)) {
      console.log('[NOTIFICATION] Already loading for activity:', activityIdRef.current)
      return
    }
    
    // Check if we have cached data (within 30 seconds)
    const cached = notificationCache.get(activityIdRef.current)
    if (cached && (Date.now() - cached.timestamp) < 30000) {
      console.log('[NOTIFICATION] Using cached data for activity:', activityIdRef.current)
      setNotifications(cached.notifications)
      return
    }
    
    // Prevent duplicate loads for the same activity
    if (hasLoadedRef.current === activityIdRef.current) {
      console.log('[NOTIFICATION] Skipping load - already loaded for activity:', activityIdRef.current)
      return
    }
    
    const loadNotifications = async () => {
      console.log('[NOTIFICATION] Loading notifications for activity:', activityIdRef.current)
      setLoading(true)
      hasLoadedRef.current = activityIdRef.current
      notificationCache.setLoading(activityIdRef.current, true)
      
      try {
        const res = await apiCall(`/api/projects/activities/${activityIdRef.current}/notifications`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        })

        console.log('[NOTIFICATION] Load response status:', res.status)

        if (res.ok) {
          const data = await res.json()
          console.log('[NOTIFICATION] Loaded notifications:', data)
          setNotifications(data.notifications || [])
          // Cache the results
          notificationCache.set(activityIdRef.current, data.notifications || [])
        } else {
          const error = await res.json()
          console.error('[NOTIFICATION] Load error:', error)
        }
      } catch (error) {
        console.error('[NOTIFICATION] Error loading notifications:', error)
      } finally {
        setLoading(false)
        notificationCache.setLoading(activityIdRef.current, false)
      }
    }

    loadNotifications()
  }, [activityId]) // Only reload when activityId changes

  // Reset loaded ref when activityId changes
  useEffect(() => {
    return () => {
      // Clear the ref when component unmounts or activityId changes
      hasLoadedRef.current = false
    }
  }, [activityId])

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

        // Upload to uploads/{projectName}/{activityId}/
        const uploadPath = `uploads/${user.id}/${projectName}/${activityId}`
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
      
      // Invalidate cache for this activity
      notificationCache.invalidate(activityId)
      
      // Add new notification to list
      setNotifications(prev => {
        console.log('[NOTIFICATION] Previous notifications:', prev)
        console.log('[NOTIFICATION] Adding to notifications list. Current count:', prev.length)
        const updated = [result.notification, ...prev]
        console.log('[NOTIFICATION] New notifications array:', updated)
        // Update cache with new data
        notificationCache.set(activityId, updated)
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
            {notifications.map((notification, index) => (
              <React.Fragment key={notification.id || index}>
                <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                            {notification.mentioned_users.map((email, i) => (
                              <Chip key={i} label={email} size="small" variant="outlined" />
                            ))}
                          </Box>
                        )}
                        
                        {notification.files?.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {notification.files.map((file, i) => (
                              <Chip
                                key={i}
                                label={file.filename}
                                size="small"
                                icon={<Download size={14} />}
                                onClick={() => {
                                  // Download file logic can be added here
                                  window.open(`/api/download/${file.path}`, '_blank')
                                }}
                              />
                            ))}
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {index < notifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  )
}

// Memoize with custom comparison to prevent unnecessary re-renders
// Only re-render when activityId or token changes, NOT when projectName changes
export default React.memo(ActivityNotifications, (prevProps, nextProps) => {
  const shouldSkipRender = (
    prevProps.activityId === nextProps.activityId &&
    prevProps.user?.token === nextProps.user?.token
  )
  
  if (!shouldSkipRender) {
    console.log('[NOTIFICATION MEMO] Props changed, will re-render:', {
      activityIdChanged: prevProps.activityId !== nextProps.activityId,
      tokenChanged: prevProps.user?.token !== nextProps.user?.token
    })
  }
  
  return shouldSkipRender
})
