import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BPMN from '../components/bpmn/BPMN'
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
  Autocomplete,
  Pagination
} from '@mui/material'
import { useTheme, alpha } from '@mui/material/styles'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import MenuIcon from '@mui/icons-material/Menu'
import HistoryIcon from '@mui/icons-material/History'
import DeleteIcon from '@mui/icons-material/Delete'
import SendIcon from '@mui/icons-material/Send'
import CancelIcon from '@mui/icons-material/Cancel'
import { agentService } from '../services/agentService'
import { agentRuntimeService } from '../services/agentRuntimeService'

// Simple function to detect and extract BPMN content
const detectBPMN = (content) => {
  console.log('🔍 BPMN Detection - Input content length:', content?.length || 0)
  console.log('🔍 BPMN Detection - Content preview:', content?.substring(0, 200) + '...')
  
  if (!content) return { hasBPMN: false, bpmnXML: null, contentWithoutBPMN: content }
  
  // Look for BPMN 2.0 XML patterns - support both namespaced and non-namespaced definitions
  const bpmnRegexes = [
    /<bpmn:definitions[\s\S]*?<\/bpmn:definitions>/i,  // With bpmn: namespace
    /<definitions[\s\S]*?<\/definitions>/i              // Without namespace
  ]
  
  for (const regex of bpmnRegexes) {
    console.log('🔍 BPMN Detection - Testing regex:', regex.toString())
    const match = content.match(regex)
    if (match) {
      console.log('✅ BPMN Match found! Length:', match[0].length)
      console.log('✅ BPMN XML preview:', match[0].substring(0, 500) + '...')
      
      // Keep the original content intact, just mark that BPMN was found
      return {
        hasBPMN: true,
        bpmnXML: match[0],
        contentWithoutBPMN: content // Keep original content with XML visible
      }
    }
  }
  
  console.log('❌ No BPMN pattern found')
  return { hasBPMN: false, bpmnXML: null, contentWithoutBPMN: content }
}

// Agent Playground using HTTP Server-Sent Events for streaming
export default function AgentPlayground({ user }) {
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const token = user?.token || localStorage.getItem('token') || ''

  // Agent list
  const [grouped, setGrouped] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  // Chat state
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [running, setRunning] = useState(false)
  const [abortController, setAbortController] = useState(null)

  // File uploads (optional knowledge)
  const [stagedFiles, setStagedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  // Session collection for uploaded knowledge (uuid-like hex)
  const [sessionCollection, setSessionCollection] = useState(() => genUuidHex())

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [conversations, setConversations] = useState([])
  const [currentConversationId, setCurrentConversationId] = useState(null)

  // Conversation history pagination
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    page_size: 5,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  })

  // Debug state changes
  useEffect(() => {
    console.log('🔄 conversations state changed:', conversations.length, conversations)
  }, [conversations])

  useEffect(() => {
    console.log('🔄 historyPagination state changed:', historyPagination)
  }, [historyPagination])

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
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [grouped])

  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [atBottom, setAtBottom] = useState(true)

  // Debug component mount
  useEffect(() => {
    console.log('🏗️ AgentPlayground component mounted')
    console.log('🏗️ Initial token:', token ? 'Present' : 'Missing')
    console.log('🏗️ Initial user:', user)
  }, [])

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

  // Check for conversation ID, agent name, or show history in URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const conversationId = searchParams.get('conversation')
    const agentName = searchParams.get('agent')
    const showHistory = searchParams.get('showHistory')

    if (conversationId && token) {
      console.log('Loading conversation from URL:', conversationId)

      const loadConversationFromUrl = async () => {
        try {
          const conv = await agentRuntimeService.getConversation(conversationId, token)
          setSelected(conv.agent_name)
          setMessages(conv.messages || [])
          setUploadedFiles(conv.uploaded_files || [])
          setSessionCollection(conv.session_prefix || conv.session_collection || genUuidHex())
          setCurrentConversationId(conv.conversation_id)
          console.log('Successfully loaded conversation:', conv.conversation_id)
        } catch (e) {
          console.error('Failed to load conversation from URL:', e)
        }
      }

      loadConversationFromUrl()
    } else if (agentName && token) {
      // Auto-select agent from URL parameter
      console.log('Auto-selecting agent from URL:', agentName)
      setSelected(agentName)
    } else if (showHistory === 'true' && token) {
      // Auto-open history dialog if requested
      console.log('Auto-opening history dialog from URL')
      setTimeout(() => openHistory(), 500) // Small delay to ensure component is ready
    }
  }, [location.search, token])

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
    if (!sessionCollection) setSessionCollection(genUuidHex())
    setUploading(true)
    try {
      const files = stagedFiles.map(sf => sf.file)
      const res = await agentRuntimeService.uploadKnowledge(sessionCollection, files, token)
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

  const cancelChat = () => {
    if (abortController) {
      // HTTP cancellation
      abortController.abort()
      setAbortController(null)
      setRunning(false)

      // Remove the streaming message and add a cancellation message
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.streaming)
        return [...filtered, {
          role: 'system',
          content: 'Chat cancelled by user.',
          ts: Date.now()
        }]
      })
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
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    // Save user message immediately
    const convId = currentConversationId || `conv_${Date.now()}`
    try {
      await agentRuntimeService.saveConversation({
        conversation_id: convId,
        agent_name: selected,
        messages: newMessages,
        uploaded_files: uploadedFiles,
        session_collection: sessionCollection,
        title: generateTitle(newMessages)
      }, token)
      if (!currentConversationId) setCurrentConversationId(convId)
    } catch (e) {
      console.error('Failed to save user message:', e)
    }

    // Add placeholder message for agent response
    const agentMsgId = Date.now()
    const agentPlaceholder = { role: 'agent', content: '', ts: agentMsgId, streaming: true }
    const messagesWithPlaceholder = [...newMessages, agentPlaceholder]
    setMessages(messagesWithPlaceholder)

    setPrompt('')

    try {
      let finalMessages = messagesWithPlaceholder

      // Use HTTP SSE for streaming
      const httpController = new AbortController()
      setAbortController(httpController)

      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: selected,
          prompt: userMsg.content,
          // Send both keys for backward compatibility during transition
          session_prefix: sessionCollection,
          session_collection: sessionCollection
        },
        token,
        httpController.signal
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body available')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))

                if (event.type === 'agent_chunk' && event.payload?.content) {
                  // Update the streaming message with new content
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.ts === agentMsgId && msg.streaming
                        ? { ...msg, content: msg.content + event.payload.content }
                        : msg
                    )
                    finalMessages = updated
                    return updated
                  })
                } else if (event.type === 'agent_run_complete') {
                  // Mark streaming as complete and save final conversation
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.ts === agentMsgId
                        ? { ...msg, streaming: false }
                        : msg
                    )
                    finalMessages = updated

                    // Save the complete conversation with the final agent response
                    agentRuntimeService.saveConversation({
                      conversation_id: convId,
                      agent_name: selected,
                      messages: updated,
                      uploaded_files: uploadedFiles,
                      session_collection: sessionCollection,
                      title: generateTitle(updated)
                    }, token).catch(e => console.error('Failed to save final conversation:', e))

                    return updated
                  })
                } else if (event.type === 'error' || event.error) {
                  const errorMsg = {
                    role: 'system',
                    content: `Error: ${event.error || event.details?.message || 'Unknown error'}`,
                    ts: Date.now()
                  }
                  setMessages(prev => {
                    const updated = [...prev, errorMsg]
                    finalMessages = updated

                    // Save conversation with error message
                    agentRuntimeService.saveConversation({
                      conversation_id: convId,
                      agent_name: selected,
                      messages: updated,
                      uploaded_files: uploadedFiles,
                      session_collection: sessionCollection,
                      title: generateTitle(updated)
                    }, token).catch(e => console.error('Failed to save conversation with error:', e))

                    return updated
                  })
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE event:', line, parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
        setAbortController(null)
        setRunning(false)
      }

    } catch (e) {
      const errorMsg = { role: 'system', content: `Error: ${e.message || e}`, ts: Date.now() }
      setMessages(prev => {
        const updated = prev.filter(msg => msg.ts !== agentMsgId).concat([errorMsg])

        // Save conversation with error
        agentRuntimeService.saveConversation({
          conversation_id: convId,
          agent_name: selected,
          messages: updated,
          uploaded_files: uploadedFiles,
          session_collection: sessionCollection,
          title: generateTitle(updated)
        }, token).catch(e => console.error('Failed to save conversation with error:', e))

        return updated
      })
    } finally {
      setRunning(false)
      setAbortController(null)
    }
  }

  const openHistory = async (page = 1) => {
    console.log('🚀 openHistory CALLED with page:', page)
    console.log('🚀 Current state - historyOpen:', historyOpen, 'loadingHistory:', loadingHistory)

    setHistoryOpen(true)
    setLoadingHistory(true)
    try {
      // Use the provided page parameter directly
      const currentPage = page
      const pageSize = 5  // Fixed page size to match backend

      console.log(`🔍 Requesting conversations: page=${currentPage}, size=${pageSize}`)
      console.log(`🎫 Using token: ${token ? 'Present' : 'Missing'}`)
      console.log(`🎫 Token value: ${token ? token.substring(0, 20) + '...' : 'NULL'}`)

      if (!token) {
        throw new Error('No authentication token available')
      }

      const result = await agentRuntimeService.listConversations(token, {
        page: currentPage,
        page_size: pageSize
      })

      console.log('📥 Raw API response:', result)
      console.log('📊 Response type:', typeof result, Array.isArray(result) ? 'Array' : 'Object')

      // Check if result has pagination structure
      if (result && result.conversations && result.pagination) {
        console.log('✅ Using paginated response format - conversations:', result.conversations.length)
        console.log('✅ Setting conversations state:', result.conversations)
        console.log('✅ Setting pagination state:', result.pagination)
        console.log('✅ Conversations before setState:', conversations.length)
        setConversations(result.conversations)
        setHistoryPagination(result.pagination)
        console.log('✅ State update calls completed')

        // Verify state was actually set (note: this might show old state due to async nature)
        setTimeout(() => {
          console.log('✅ Conversations after setState (delayed check):', conversations.length)
        }, 100)
      } else if (Array.isArray(result)) {
        console.log('⚠️ Using legacy array format - length:', result.length)
        console.log('⚠️ Array result:', result)
        setConversations(result)
        setHistoryPagination({
          page: 1,
          page_size: 5,
          total: result.length,
          total_pages: 1,
          has_next: false,
          has_prev: false
        })
      } else if (result && Array.isArray(result.conversations)) {
        console.log('⚠️ Using conversations array without pagination - length:', result.conversations.length)
        console.log('⚠️ Conversations array:', result.conversations)
        setConversations(result.conversations)
        setHistoryPagination({
          page: 1,
          page_size: 5,
          total: result.conversations.length,
          total_pages: 1,
          has_next: false,
          has_prev: false
        })
      } else {
        console.log('❌ No conversations found or unexpected format')
        console.log('❌ Result structure:', JSON.stringify(result, null, 2))
        console.log('❌ Result type:', typeof result)
        console.log('❌ Is result null?', result === null)
        console.log('❌ Is result undefined?', result === undefined)
        setConversations([])
        setHistoryPagination({
          page: 1,
          page_size: 5,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false
        })
      }
    } catch (e) {
      console.error('💥 History list API failed:', e)
      console.error('💥 Error details:', e.message, e.stack)
      console.error('💥 Error name:', e.name)
      console.error('💥 Full error object:', e)
      setConversations([])
      setHistoryPagination({
        page: 1,
        page_size: 5,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_prev: false
      })
    } finally {
      console.log('🏁 openHistory finally block - setting loadingHistory to false')
      console.log('🏁 Current conversations length:', conversations.length)
      setLoadingHistory(false)
    }
  }

  const loadConversation = async (id) => {
    try {
      const conv = await agentRuntimeService.getConversation(id, token)
      setSelected(conv.agent_name)
      setMessages(conv.messages || [])
      setUploadedFiles(conv.uploaded_files || [])
      setSessionCollection(conv.session_prefix || conv.session_collection || genUuidHex())
      setCurrentConversationId(conv.conversation_id)
      setHistoryOpen(false)
    } catch (e) {
      console.error('load conversation failed', e)
    }
  }

  const deleteConversation = async (id, e) => {
    if (e) e.stopPropagation()
    try { await agentRuntimeService.deleteConversation(id, token) } catch { }
    setConversations(prev => prev.filter(c => c.conversation_id !== id))
  }

  const clearChat = () => {
    setMessages([])
    setUploadedFiles([])
    setStagedFiles([])
    setCurrentConversationId(null)
    setSessionCollection(genUuidHex())
  }

  // Generate conversation title from first user message
  const generateTitle = (messages) => {
    const firstUserMsg = messages.find(msg => msg.role === 'user')
    if (!firstUserMsg || !firstUserMsg.content) return null

    const words = firstUserMsg.content.trim().split(/\s+/)
    if (words.length > 25) {
      return words.slice(0, 25).join(' ') + '...'
    }
    return firstUserMsg.content.trim()
  }

  const renderGroupedList = () => {
    const cats = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
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
                  '& table': {
                    borderCollapse: 'collapse',
                    width: '100%',
                    mt: 1,
                    mb: 1,
                    border: '1px solid',
                    borderColor: 'divider'
                  },
                  '& th': {
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 1,
                    bgcolor: 'action.hover',
                    fontWeight: 600,
                    textAlign: 'left'
                  },
                  '& td': {
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 1
                  },
                  '& tr:nth-of-type(even)': {
                    bgcolor: 'action.selected'
                  }
                }}>
                  {(() => {
                    const bpmnData = detectBPMN(m.content)
                    console.log('🎨 Rendering message - BPMN detected:', bpmnData.hasBPMN)
                    console.log('🎨 Content length:', m.content?.length || 0)
                    
                    return (
                      <>
                        {/* Always show the original content including XML */}
                        {bpmnData.contentWithoutBPMN && (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {bpmnData.contentWithoutBPMN}
                          </ReactMarkdown>
                        )}
                        
                        {/* Additionally show BPMN diagram if detected */}
                        {bpmnData.hasBPMN && (
                          <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                            <Typography variant="caption" sx={{ 
                              display: 'block', 
                              bgcolor: 'action.hover', 
                              px: 1, 
                              py: 0.5, 
                              borderBottom: '1px solid', 
                              borderColor: 'divider',
                              fontWeight: 600 
                            }}>
                              BPMN Diagram Visualization
                            </Typography>
                            <Box sx={{ position: 'relative', height: '500px', width: '100%' }}>
                              <BPMN 
                                readOnly={true}
                                showToolbox={false}
                                showPropertyPanel={false}
                                initialBPMN={bpmnData.bpmnXML}
                                style={{ 
                                  height: '100%', 
                                  width: '100%',
                                  '--toolbar-display': 'none' // CSS custom property to force hide toolbar
                                }}
                                className="bpmn-readonly-viewer"
                                onError={(error) => {
                                  console.error('🔥 BPMN Component Error:', error)
                                }}
                                onLoad={() => {
                                  console.log('✅ BPMN Component Loaded Successfully')
                                }}
                              />
                            </Box>
                          </Box>
                        )}
                        
                        {/* Fallback if no content */}
                        {!bpmnData.contentWithoutBPMN && !bpmnData.hasBPMN && (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content && m.content.length ? m.content : '...'}
                          </ReactMarkdown>
                        )}
                      </>
                    )
                  })()}
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
              sx={{ '& .MuiInputBase-root': { pr: running ? 14 : 8, fontSize: '14px', alignItems: 'flex-start' } }}
            />
            {running ? (
              <IconButton onClick={cancelChat} size="small" color="error" sx={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)' }}>
                <CancelIcon fontSize="small" />
              </IconButton>
            ) : (
              <IconButton onClick={runAgent} disabled={!selected || !prompt.trim() || uploading} size="small" sx={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)' }}>
                {uploading ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
              </IconButton>
            )}
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

            <IconButton size="small" onClick={() => {
              console.log('🔘 History button clicked!')
              openHistory()
            }} title="History"><HistoryIcon fontSize="small" /></IconButton>
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
            onChange={(_, v) => {
              if (v && v.value) {
                setSelected(v.value);
                setSelectorOpen(false);
              }
            }}
            getOptionLabel={(o) => o?.label || ''}
            renderInput={(params) => <TextField {...params} label="Search agents" placeholder="Type to search" />}
            isOptionEqualToValue={(o, v) => (o?.value || '') === (v?.value || '')}
            sx={{ mb: 1 }}
          />
          <Box sx={{ maxHeight: 360, overflow: 'auto', pr: 0.5 }}>
            {renderGroupedList()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectorOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Conversation History
            {historyPagination.total > 0 && (
              <Typography variant="caption" color="text.secondary">
                {historyPagination.total} total conversations
              </Typography>
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingHistory ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : conversations.length === 0 ? (
            <Typography variant="body2" sx={{ textAlign: 'center', py: 4, opacity: 0.7 }}>No conversation history found</Typography>
          ) : (
            <>
              <List>
                {conversations.map((c) => (
                  <Box key={c.conversation_id || c.id || Math.random()} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1, cursor: 'pointer' }} onClick={() => loadConversation(c.conversation_id || c.id)}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{c.title || c.conversation_id || c.id || 'Untitled Conversation'}</Typography>
                      <Typography variant="body2" color="text.secondary">Agent: {c.agent_name || 'Unknown'}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date((c.updated_at || Date.now())).toLocaleString()}</Typography>
                    </Box>
                    <IconButton size="small" color="error" onClick={(e) => deleteConversation(c.conversation_id || c.id, e)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
              </List>

              {/* Pagination Controls */}
              {historyPagination.total_pages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, py: 2 }}>
                  <Pagination
                    count={historyPagination.total_pages}
                    page={historyPagination.page}
                    onChange={(event, page) => {
                      setHistoryPagination(prev => ({ ...prev, page }))
                      openHistory(page)
                    }}
                    color="primary"
                    size="small"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              )}
            </>
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
  } catch { }
  const u = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 32)
  return u.toLowerCase()
}
