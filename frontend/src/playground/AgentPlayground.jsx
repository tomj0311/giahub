import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Box,
  Paper,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  IconButton,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  useMediaQuery,
  Autocomplete
} from '@mui/material'
import { useTheme, alpha } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import MenuIcon from '@mui/icons-material/Menu'
import HistoryIcon from '@mui/icons-material/History'
import DeleteIcon from '@mui/icons-material/Delete'
import SendIcon from '@mui/icons-material/Send'
import { agentService } from '../services/agentService'
import { agentRuntimeService } from '../services/agentRuntimeService'

// Lightweight, HTTP-only Agent Playground (no websockets)
export default function AgentPlayground({ user }) {
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('md'))
  const token = user?.token || localStorage.getItem('token') || ''

  // Agent list
  const [grouped, setGrouped] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  // Chat state
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [running, setRunning] = useState(false)

  // File uploads (optional knowledge)
  const [stagedFiles, setStagedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  // Session prefix for uploaded knowledge (uuid-like hex)
  const [sessionPrefix, setSessionPrefix] = useState(() => genUuidHex())

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [conversations, setConversations] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(null)

  // Agent selector dialog
  const [selectorOpen, setSelectorOpen] = useState(false)

  // Build autocomplete options from grouped structure
  const searchOptions = useMemo(() => {
    const opts = []
    Object.entries(grouped).forEach(([cat, arr]) => {
      arr.forEach(name => {
        const label = cat === '_root' ? name : `${cat}/${name}`
        opts.push({ label, value: name, category: cat })
      })
    })
    return opts.sort((a,b) => a.label.localeCompare(b.label))
  }, [grouped])

  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    const loadAgents = async () => {
      setLoading(true)
      try {
        const agents = await agentService.listAgents(token)
        console.log('Loaded agents:', agents) // Debug log
        const groupedByCat = agents.reduce((acc, a) => {
          const cat = a.category || '_root'
          acc[cat] = acc[cat] || []
          acc[cat].push(a.name)
          return acc
        }, {})
        Object.keys(groupedByCat).forEach(k => groupedByCat[k].sort())
        console.log('Grouped agents:', groupedByCat) // Debug log
        setGrouped(groupedByCat)
      } catch (e) {
        console.error('Failed to load agents', e)
      } finally {
        setLoading(false)
      }
    }
    loadAgents()
  }, [token])

  // Scroll control
  useEffect(() => {
    if (!autoScroll) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, autoScroll])

  const handleScroll = (e) => {
    const el = e.currentTarget
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    const atB = distanceFromBottom < 20
    setAtBottom(atB)
  }

  // File selection
  const handleFilesSelected = (filesList) => {
    const newStaged = Array.from(filesList || []).map(f => ({ file: f, name: f.name, size: f.size, type: f.type }))
    setStagedFiles(prev => [...prev, ...newStaged])
  }

  // Upload knowledge files to backend and mark as uploaded
  const uploadStagedFiles = async () => {
    if (stagedFiles.length === 0) return []
    if (!sessionPrefix) setSessionPrefix(genUuidHex())
    setUploading(true)
    try {
      const files = stagedFiles.map(sf => sf.file)
      const res = await agentRuntimeService.uploadKnowledge(sessionPrefix, files, token)
      const names = (res?.files || []).map(f => f.filename)
      setUploadedFiles(prev => [...prev, ...names])
      setStagedFiles([])
      return names
    } catch (e) {
      console.error('Upload failed', e)
      return []
    } finally {
      setUploading(false)
    }
  }

  const runAgent = async () => {
    if (!selected || !prompt.trim()) return
    setRunning(true)
    
    // upload first if needed
    if (stagedFiles.length) {
      await uploadStagedFiles()
    }
    
    const userMsg = { role: 'user', content: prompt, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    
    // Add placeholder message for agent response
    const agentMsgId = Date.now()
    setMessages(prev => [...prev, { role: 'agent', content: '', ts: agentMsgId, streaming: true }])
    
    setPrompt('')
    
    try {
      await agentRuntimeService.runStream(
        { 
          agent_name: selected, 
          prompt: userMsg.content, 
          session_prefix: sessionPrefix 
        }, 
        token,
        (event) => {
          if (event.type === 'agent_chunk' && event.payload?.content) {
            // Update the streaming message with new content
            setMessages(prev => prev.map(msg => 
              msg.ts === agentMsgId && msg.streaming 
                ? { ...msg, content: msg.content + event.payload.content }
                : msg
            ))
          } else if (event.type === 'agent_run_complete') {
            // Mark streaming as complete
            setMessages(prev => prev.map(msg => 
              msg.ts === agentMsgId 
                ? { ...msg, streaming: false }
                : msg
            ))
          } else if (event.type === 'error' || event.error) {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: `Error: ${event.error || event.details?.message || 'Unknown error'}`, 
              ts: Date.now() 
            }])
          }
        }
      )
    } catch (e) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${e.message || e}`, ts: Date.now() }])
      // Remove the placeholder message on error
      setMessages(prev => prev.filter(msg => msg.ts !== agentMsgId))
    } finally {
      setRunning(false)
      // autosave snapshot
      try {
        const convId = currentConversationId || `conv_${Date.now()}`
        await agentRuntimeService.saveConversation({
          conversation_id: convId,
          agent_name: selected,
          messages,
          uploaded_files: uploadedFiles,
          session_prefix: sessionPrefix
        }, token)
        if (!currentConversationId) setCurrentConversationId(convId)
      } catch {}
    }
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    setLoadingHistory(true)
    try {
      const list = await agentRuntimeService.listConversations(token)
      setConversations(list)
    } catch (e) {
      console.error('history list failed', e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadConversation = async (id) => {
    try {
      const conv = await agentRuntimeService.getConversation(id, token)
      setSelected(conv.agent_name)
      setMessages(conv.messages || [])
      setUploadedFiles(conv.uploaded_files || [])
      setSessionPrefix(conv.session_prefix || genUuidHex())
      setCurrentConversationId(conv.conversation_id)
      setHistoryOpen(false)
    } catch (e) {
      console.error('load conversation failed', e)
    }
  }

  const deleteConversation = async (id, e) => {
    if (e) e.stopPropagation()
    try { await agentRuntimeService.deleteConversation(id, token) } catch {}
    setConversations(prev => prev.filter(c => c.conversation_id !== id))
  }

  const clearChat = () => {
    setMessages([])
    setUploadedFiles([])
    setStagedFiles([])
    setCurrentConversationId(null)
    setSessionPrefix(genUuidHex())
  }

  const renderGroupedList = () => {
    const cats = Object.keys(grouped).sort((a,b) => a.localeCompare(b))
    if (!cats.length && !loading) return <Typography variant="body2" sx={{ p: 1 }}>No agents found.</Typography>
    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={20} /></Box>
    return cats.map((cat, idx) => {
      const items = grouped[cat] || []
      const title = cat === '_root' ? 'Uncategorized' : cat
      return (
        <Accordion key={cat} disableGutters elevation={0} square>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pl: 1 }}>
            <Typography variant="subtitle2" sx={{ pl: 1 }}>{title} ({items.length})</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <List dense sx={{ py: 0 }}>
              {items.map((name) => (
                <ListItemButton 
                  key={name} 
                  selected={name === selected} 
                  onClick={() => {
                    setSelected(name)
                    setSelectorOpen(false)
                  }} 
                  sx={{ pl: 2 }}
                >
                  <ListItemText primary={name} primaryTypographyProps={{ sx: { pl: 1 } }} />
                </ListItemButton>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )
    })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 900, mx: 'auto', height: { xs: 'calc(100dvh - 120px)', md: 'calc(100vh - 120px)' } }}>
      <Paper variant="section" elevation={0} square sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, background: 'transparent', boxShadow: 'none', border: 'none' }}>
        {/* Messages area */}
        <Box
          ref={scrollRef}
          onScroll={handleScroll}
          sx={{ flex: 1, minHeight: 0, p: isSmall ? 1 : 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          {messages.map((m, idx) => (
            <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase' }}>
                {m.role}{m.streaming ? ' (streaming...)' : ''}
              </Typography>
              {m.role === 'user' ? (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '90ch' }}>
                  {m.content}
                </Typography>
              ) : (
                <Box sx={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  maxWidth: '90ch',
                  wordBreak: 'break-word',
                  '& p': { my: 0.6 },
                  '& pre': { p: 1, bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto', fontSize: 13, lineHeight: 1.4 },
                  '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
                }}>
                  <ReactMarkdown>
                    {m.content && m.content.length ? m.content : '...'}
                  </ReactMarkdown>
                </Box>
              )}
            </Box>
          ))}
          {!autoScroll && !atBottom && messages.length > 0 && (
            <Box sx={{ position: 'sticky', bottom: 4, alignSelf: 'center' }}>
              <Tooltip title="Jump to latest" arrow placement="top" disableInteractive>
                <IconButton size="small" onClick={() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; setAutoScroll(true) }}
                  sx={(t) => ({
                    bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : alpha(t.palette.common.black, 0.04),
                    border: `1px solid ${alpha(t.palette.primary.main, 0.25)}`,
                  })}
                >
                  <ArrowDownwardIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          <span ref={bottomRef} style={{ display: 'block', height: 1, width: 1 }} />
        </Box>

        {/* Input row */}
        <Box sx={{ position: 'relative', width: '100%', maxWidth: 650, alignSelf: 'center', backgroundColor: 'background.paper', borderRadius: 1.5, border: 1, borderColor: 'divider', p: 1.5, mb: 3 }}>
          <Box sx={{ position: 'relative' }}>
            <TextField
              placeholder={!selected ? 'Select an agent first' : (stagedFiles.length ? `Type your message... (${stagedFiles.length} file(s) ready)` : 'Type your message...')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent() } }}
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              disabled={!selected || running}
              size="small"
              sx={{ '& .MuiInputBase-root': { pr: 8, fontSize: '14px', alignItems: 'flex-start' } }}
            />
            <IconButton onClick={runAgent} disabled={!selected || running || !prompt.trim() || uploading} size="small" sx={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)' }}>
              {running || uploading ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
            </IconButton>
          </Box>

          {/* Controls moved to bottom */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            {/* Agent Selector Button */}
            <Button
              variant="text"
              size="small"
              onClick={() => setSelectorOpen(true)}
              disabled={running}
              startIcon={<MenuIcon />}
              sx={{ 
                textTransform: 'none',
                fontSize: '12px',
                minWidth: 'auto',
                px: 1
              }}
            >
              {selected ? selected.replace(/\.json$/, '').slice(0, 15) + (selected.replace(/\.json$/, '').length > 15 ? '...' : '') : 'Agent'}
            </Button>
            
            {/* Attach File Icon */}
            <input
              id="file-upload-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFilesSelected(Array.from(e.target.files || []))}
            />
            <label htmlFor="file-upload-input">
              <IconButton component="span" size="small" disabled={running} sx={{ color: stagedFiles.length > 0 ? 'primary.main' : 'text.secondary', opacity: 0.8 }}>
                <AttachFileIcon fontSize="small" />
              </IconButton>
            </label>

            {/* Upload Chips */}
            {stagedFiles.map((f, idx) => (
              <Chip key={`${f.name}-${idx}`} size="small" color="primary" variant="outlined" label={f.name.length > 15 ? f.name.slice(0, 12) + '...' : f.name} onDelete={() => setStagedFiles(prev => prev.filter((_, i) => i !== idx))} sx={{ height: 20, fontSize: '10px' }} />
            ))}
            {uploadedFiles.map((name, idx) => (
              <Chip key={`up-${name}-${idx}`} size="small" color="success" variant="filled" label={name.length > 15 ? name.slice(0, 12) + '...' : name} sx={{ height: 20, fontSize: '10px' }} />
            ))}
            
            <Box sx={{ flex: 1 }} />
            
            <IconButton size="small" onClick={openHistory} title="History"><HistoryIcon fontSize="small" /></IconButton>
            <Button size="small" onClick={clearChat} color="error">Clear</Button>
          </Box>
        </Box>
      </Paper>

      {/* Agent selection dialog */}
      <Dialog 
        open={selectorOpen} 
        onClose={() => setSelectorOpen(false)} 
        fullWidth 
        maxWidth="sm"
        PaperProps={{
          sx: (theme) => ({
            backgroundColor: theme.palette.background.paper,
            backgroundImage: 'none'
          })
        }}
      >
        <DialogTitle>Select an Agent</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>Choose from available agents</Typography>
            <Button size="small" onClick={() => window.location.reload()}>Refresh</Button>
          </Box>
          <Autocomplete
            size="small"
            options={searchOptions}
            value={searchOptions.find(opt => opt.value === selected) || null}
            onChange={(_, v)=> { 
              if (v && v.value) { 
                setSelected(v.value); 
                setSelectorOpen(false); 
              } 
            }}
            getOptionLabel={(o)=> o?.label || ''}
            renderInput={(params)=><TextField {...params} label="Search agents" placeholder="Type to search" />}
            isOptionEqualToValue={(o,v)=> (o?.value||'')===(v?.value||'')}
            sx={{ mb:1 }}
          />
          <Box sx={{ maxHeight: 360, overflow:'auto', pr:0.5 }}>
            {renderGroupedList()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectorOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Conversation History</DialogTitle>
        <DialogContent dividers>
          {loadingHistory ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : conversations.length === 0 ? (
            <Typography variant="body2" sx={{ textAlign: 'center', py: 4, opacity: 0.7 }}>No conversation history found</Typography>
          ) : (
            <List>
              {conversations.map((c) => (
                <Box key={c.conversation_id} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1, cursor: 'pointer' }} onClick={() => loadConversation(c.conversation_id)}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{c.title || c.conversation_id}</Typography>
                    <Typography variant="body2" color="text.secondary">Agent: {c.agent_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date((c.updated_at || Date.now())).toLocaleString()}</Typography>
                  </Box>
                  <IconButton size="small" color="error" onClick={(e) => deleteConversation(c.conversation_id, e)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// Utils
export function genUuidHex() {
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {}
  const u = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0,32)
  return u.toLowerCase()
}
