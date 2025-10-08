import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BPMN from '../components/bpmn/BPMN'
import DynamicComponent from '../components/dynamic/DynamicComponent'
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
import EditIcon from '@mui/icons-material/Edit'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import { agentService } from '../services/agentService'
import { agentRuntimeService } from '../services/agentRuntimeService'
import sharedApiService from '../utils/apiService'

// Simple function to detect and extract BPMN content
const detectBPMN = (content) => {
  // Debug logs removed for production cleanliness
  
  if (!content) return { hasBPMN: false, bpmnXML: null, contentWithoutBPMN: content }
  
  // Look for BPMN 2.0 XML patterns - support both namespaced and non-namespaced definitions
  const bpmnRegexes = [
    /<bpmn:definitions[\s\S]*?<\/bpmn:definitions>/i,  // With bpmn: namespace
    /<definitions[\s\S]*?<\/definitions>/i              // Without namespace
  ]
  
  for (const regex of bpmnRegexes) {
    const match = content.match(regex)
    if (match) {
      
      // Keep the original content intact, just mark that BPMN was found
      return {
        hasBPMN: true,
        bpmnXML: match[0],
        contentWithoutBPMN: content // Keep original content with XML visible
      }
    }
  }
  return { hasBPMN: false, bpmnXML: null, contentWithoutBPMN: content }
}

// Simple function to detect and extract JSX code blocks
const detectJSX = (content) => {
  if (!content) return { hasJSX: false, jsxCode: null, contentWithoutJSX: content, jsxBlocks: [] }
  
  // Look for JSX code blocks with ```jsx or ```react
  const jsxRegex = /```(?:jsx|react)\s*\n([\s\S]*?)\n```/gi
  const matches = []
  let match
  
  while ((match = jsxRegex.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      code: match[1].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  if (matches.length > 0) {
    // For now, take the first JSX block found
    const firstMatch = matches[0]
    
    // Remove JSX blocks from content for markdown rendering
    let contentWithoutJSX = content
    matches.forEach(m => {
      contentWithoutJSX = contentWithoutJSX.replace(m.fullMatch, '')
    })
    
    return {
      hasJSX: true,
      jsxCode: firstMatch.code,
      contentWithoutJSX: contentWithoutJSX.trim(),
      jsxBlocks: matches
    }
  }
  
  return { hasJSX: false, jsxCode: null, contentWithoutJSX: content, jsxBlocks: [] }
}

// Simple function to detect base64 image strings
const detectBase64Images = (content) => {
  if (!content) return { hasImages: false, images: [], contentWithoutImages: content }
  
  // Match base64 image data URIs and standalone base64 strings (more aggressive)
  const b64Patterns = [
    // Data URI format
    /data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/gi,
    // Standalone base64 strings (100+ chars to catch them all)
    /\b([A-Za-z0-9+/]{100,}={0,2})\b/g
  ]
  
  const images = []
  let contentWithoutImages = content
  
  b64Patterns.forEach(regex => {
    let match
    const tempRegex = new RegExp(regex.source, regex.flags)
    while ((match = tempRegex.exec(content)) !== null) {
      const fullMatch = match[0]
      let imgSrc = fullMatch
      
      // If it's already a data URI, use it as is
      if (fullMatch.startsWith('data:image')) {
        imgSrc = fullMatch.trim()
      } 
      // If it's a standalone base64 string, try to detect format or assume PNG
      else {
        const b64String = match[1] || fullMatch.trim()
        // Try to detect image format from base64 header
        if (b64String.startsWith('iVBORw0KGgo')) {
          imgSrc = `data:image/png;base64,${b64String}`
        } else if (b64String.startsWith('/9j/')) {
          imgSrc = `data:image/jpeg;base64,${b64String}`
        } else if (b64String.startsWith('R0lGOD')) {
          imgSrc = `data:image/gif;base64,${b64String}`
        } else if (b64String.startsWith('UklGR')) {
          imgSrc = `data:image/webp;base64,${b64String}`
        } else {
          // Default to PNG if can't detect
          imgSrc = `data:image/png;base64,${b64String}`
        }
      }
      
      images.push({
        src: imgSrc,
        fullMatch: fullMatch,
        index: match.index
      })
    }
  })
  
  // Remove duplicates and sort by index
  const uniqueImages = images.filter((img, idx, self) => 
    idx === self.findIndex(t => t.src === img.src)
  ).sort((a, b) => a.index - b.index)
  
  // Remove image strings from content (clean up whitespace too)
  uniqueImages.forEach(img => {
    contentWithoutImages = contentWithoutImages.replace(img.fullMatch, '')
  })
  
  // Clean up extra whitespace and newlines left behind
  contentWithoutImages = contentWithoutImages
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/^\s+|\s+$/g, '') // Trim
  
  return {
    hasImages: uniqueImages.length > 0,
    images: uniqueImages,
    contentWithoutImages: contentWithoutImages
  }
}

// Utility function to convert PCM16 base64 to WAV base64
const pcm16ToWav = (base64Pcm16, sampleRate = 24000, numChannels = 1) => {
  try {
    // Decode base64 to binary
    const pcmData = atob(base64Pcm16)
    const pcmBytes = new Uint8Array(pcmData.length)
    for (let i = 0; i < pcmData.length; i++) {
      pcmBytes[i] = pcmData.charCodeAt(i)
    }
    
    // Calculate sizes
    const dataSize = pcmBytes.length
    const fileSize = 44 + dataSize // WAV header is 44 bytes
    const byteRate = sampleRate * numChannels * 2 // 2 bytes per sample (16-bit)
    const blockAlign = numChannels * 2
    
    // Create WAV file buffer
    const wavBuffer = new ArrayBuffer(fileSize)
    const view = new DataView(wavBuffer)
    
    // Write WAV header
    // "RIFF" chunk descriptor
    view.setUint32(0, 0x52494646, false) // "RIFF"
    view.setUint32(4, fileSize - 8, true) // File size - 8
    view.setUint32(8, 0x57415645, false) // "WAVE"
    
    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false) // "fmt "
    view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true) // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true) // NumChannels
    view.setUint32(24, sampleRate, true) // SampleRate
    view.setUint32(28, byteRate, true) // ByteRate
    view.setUint16(32, blockAlign, true) // BlockAlign
    view.setUint16(34, 16, true) // BitsPerSample
    
    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false) // "data"
    view.setUint32(40, dataSize, true) // Subchunk2Size
    
    // Copy PCM data
    const wavData = new Uint8Array(wavBuffer)
    wavData.set(pcmBytes, 44)
    
    // Convert to base64
    let binary = ''
    const bytes = new Uint8Array(wavBuffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  } catch (error) {
    console.error('Failed to convert PCM16 to WAV:', error)
    return null
  }
}

// Simple Audio Player Component using Web Audio API for gapless playback
const AudioPlayer = ({ audioChunks }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioContextRef = useRef(null)
  const processedChunksRef = useRef(0)
  const nextStartTimeRef = useRef(0)
  const scheduledSourcesRef = useRef([])

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Process new chunks and schedule them for gapless playback
  useEffect(() => {
    if (!audioChunks || audioChunks.length === 0) return
    if (!audioContextRef.current) return

    const newChunks = audioChunks.slice(processedChunksRef.current)
    if (newChunks.length === 0) return

    const audioContext = audioContextRef.current

    // Combine new chunks into a single PCM buffer for smoother playback
    let combinedPcm = ''
    newChunks.forEach(chunk => {
      if (chunk.data) {
        combinedPcm += chunk.data
      }
    })

    if (combinedPcm) {
      // Convert PCM16 to WAV
      const wavBase64 = pcm16ToWav(combinedPcm)
      if (wavBase64) {
        // Decode base64 to array buffer
        const binaryString = atob(wavBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Decode audio data
        audioContext.decodeAudioData(bytes.buffer.slice(0), (audioBuffer) => {
          const source = audioContext.createBufferSource()
          source.buffer = audioBuffer
          source.connect(audioContext.destination)

          // Schedule this chunk to play right after the previous one
          const startTime = Math.max(audioContext.currentTime, nextStartTimeRef.current)
          source.start(startTime)
          
          // Update next start time for gapless playback
          nextStartTimeRef.current = startTime + audioBuffer.duration
          
          // Track playing state
          setIsPlaying(true)
          source.onended = () => {
            // Check if there are more sources scheduled
            const index = scheduledSourcesRef.current.indexOf(source)
            if (index > -1) {
              scheduledSourcesRef.current.splice(index, 1)
            }
            if (scheduledSourcesRef.current.length === 0) {
              setIsPlaying(false)
            }
          }

          scheduledSourcesRef.current.push(source)
        }, (error) => {
          console.error('Error decoding audio:', error)
        })
      }
    }

    processedChunksRef.current = audioChunks.length
  }, [audioChunks])

  // Cleanup
  useEffect(() => {
    return () => {
      scheduledSourcesRef.current.forEach(source => {
        try {
          source.stop()
        } catch (e) {
          // Already stopped
        }
      })
      scheduledSourcesRef.current = []
    }
  }, [])

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center',
      gap: 1, 
      p: 1.5, 
      border: '1px solid', 
      borderColor: 'divider', 
      borderRadius: 1,
      bgcolor: 'action.hover',
      maxWidth: 500
    }}>
      <IconButton 
        size="small" 
        disabled
        sx={{ 
          bgcolor: isPlaying ? 'success.main' : 'action.disabled', 
          color: 'primary.contrastText',
        }}
      >
        {isPlaying ? <PlayArrowIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
      </IconButton>
      
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
          <VolumeUpIcon fontSize="inherit" />
          {isPlaying ? 'Playing Audio...' : 'Audio Response'}
        </Typography>
      </Box>
    </Box>
  )
}

// Agent Playground using HTTP Server-Sent Events for streaming
export default function AgentPlayground({ user }) {
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('md'))
  const mainContainerRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
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
  const [lastUserMessage, setLastUserMessage] = useState('')
  
  // Track audio data for messages (map of message timestamp to audio data)
  const [messageAudio, setMessageAudio] = useState({})

  // File uploads (optional knowledge)
  const [stagedFiles, setStagedFiles] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  // Session collection for uploaded knowledge (uuid-like hex)
  const [sessionCollection, setSessionCollection] = useState(() => genUuidHex())
  
  // Store the actual vector collection name for the current conversation
  const [vectorCollectionName, setVectorCollectionName] = useState(null)

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingPagination, setLoadingPagination] = useState(false)
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
  useEffect(() => {}, [conversations])
  useEffect(() => {}, [historyPagination])
  useEffect(() => {}, [uploadedFiles])

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
  // Dynamic input area height spacing so last message rests right above input (no extra gap / no overlap)
  const [inputHeight, setInputHeight] = useState(180) // fallback default

  // Debug component mount
  useEffect(() => { return () => {}; }, [])

  useEffect(() => {
    const loadAgents = async () => {
      setLoading(true)
      try {
        const result = await sharedApiService.makeRequest(
          '/api/agents',
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          { endpoint: 'agents', token: token?.substring(0, 10) }
        )
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load agents')
        }
        
        const agents = result.data.agents || []
        const groupedByCat = agents.reduce((acc, a) => {
          const cat = a.category || '_root'
          acc[cat] = acc[cat] || []
          acc[cat].push(a.name)
          return acc
        }, {})
        Object.keys(groupedByCat).forEach(k => groupedByCat[k].sort())
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

      const loadConversationFromUrl = async () => {
        try {
          const conv = await agentRuntimeService.getConversation(conversationId, token)
          
          setSelected(conv.agent_name)
          setMessages(conv.messages || [])
          setMessageAudio(conv.message_audio || {})  // Load audio data
          setUploadedFiles(conv.uploaded_files || [])
          setSessionCollection(conv.session_prefix || conv.session_collection || genUuidHex())
          setVectorCollectionName(conv.vector_collection_name || null) // Load the vector collection name
          setCurrentConversationId(conv.conversation_id)
          
          // Set last user message from conversation history
          const lastUserMsg = (conv.messages || []).filter(msg => msg.role === 'user').pop()
          setLastUserMessage(lastUserMsg ? lastUserMsg.content : '')
          
        } catch (e) {
          console.error('Failed to load conversation from URL:', e)
        }
      }

      loadConversationFromUrl()
    } else if (agentName && token) {
      // Auto-select agent from URL parameter
      setSelected(agentName)
    } else if (showHistory === 'true' && token) {
      // Auto-open history dialog if requested
      setTimeout(() => openHistory(), 500) // Small delay to ensure component is ready
    }
  }, [location.search, token])

  // Update URL when conversation ID changes to enable proper browser navigation
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      const currentParams = new URLSearchParams(location.search)
      const currentConvId = currentParams.get('conversation')
      
      // Only update URL if conversation ID has changed
      if (currentConvId !== currentConversationId) {
        const newParams = new URLSearchParams(location.search)
        newParams.set('conversation', currentConversationId)
        
        // Use replace instead of push to avoid adding extra history entries during active chat
        const newUrl = `${location.pathname}?${newParams.toString()}`
        navigate(newUrl, { replace: true })
      }
    }
  }, [currentConversationId, messages.length, location.search, location.pathname, navigate])

  // Scroll control - now uses window scroll instead of chat area scroll
  useEffect(() => {
    if (!autoScroll) return
    // Avoid expensive smooth animation for every token while streaming
    const last = messages[messages.length - 1]
    const lastIsStreaming = !!last?.streaming
    const target = Math.max(0, document.documentElement.scrollHeight - inputHeight)
    window.scrollTo({
      top: target,
      behavior: lastIsStreaming ? 'auto' : 'smooth'
    })
  }, [messages, autoScroll, inputHeight])

  const handleInputHeightChange = useCallback((h) => {
    setInputHeight(h)
  }, [])

  const handleScroll = (e) => {
    // Handle window scroll instead of chat area scroll
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const windowHeight = window.innerHeight
    const documentHeight = document.documentElement.scrollHeight
    const distanceFromBottom = documentHeight - windowHeight - scrollTop
    const atB = distanceFromBottom < 100
    setAtBottom(atB)
    
    // Disable auto-scroll when user manually scrolls up
    if (!atB && autoScroll) {
      setAutoScroll(false)
    }
    // Re-enable auto-scroll when user scrolls back to bottom
    else if (atB && !autoScroll) {
      setAutoScroll(true)
    }
  }

  // Add window scroll listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [autoScroll]) // Re-add listener when autoScroll changes

  // File selection
  const handleFilesSelected = (filesList) => {
    const newStaged = Array.from(filesList || []).map(f => ({ file: f, name: f.name, size: f.size, type: f.type }))
    setStagedFiles(prev => [...prev, ...newStaged])
  }

  const cancelChat = useCallback(() => {
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
  }, [abortController])

  // Helper function to format chat history as plain text
  const formatHistoryAsText = (messages, numMessages) => {
    if (!messages || messages.length === 0 || !numMessages || numMessages <= 0) {
      return ''
    }
    
    // Get the last N messages (excluding the current user message)
    const historyMessages = messages.slice(-numMessages)
    
    // Format as plain text
    const formattedHistory = historyMessages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n')
    
    return formattedHistory
  }

  const runAgent = useCallback(async () => {
    if (!selected || !prompt.trim()) return
    setRunning(true)

    const userMsg = { role: 'user', content: prompt, ts: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    
    // Store the last user message for up arrow recall
    setLastUserMessage(prompt)

    // Generate conversation ID with user ID format
    const convId = currentConversationId || `conv_${Date.now()}`
    if (!currentConversationId) setCurrentConversationId(convId)

    // Get agent configuration to check history settings
    let finalPrompt = userMsg.content
    try {
      const agentConfig = await agentService.getAgent(selected, token)
      
      // Check if history is enabled in agent configuration
      if (agentConfig?.memory?.history?.enabled && agentConfig.memory.history.num > 0) {
        const numHistoryMessages = agentConfig.memory.history.num
        const historyText = formatHistoryAsText(messages, numHistoryMessages)
        
        if (historyText) {
          // Include history in the prompt
          finalPrompt = `Previous conversation history:\n${historyText}\n\nCurrent message:\n${userMsg.content}`
        }
      }
    } catch (e) {
      console.error('Failed to get agent config for history:', e)
      // Continue with original prompt if agent config fails
    }

    // Prepare files for upload (convert staged files to actual File objects)
    let filesToUpload = []
    let currentUploadedFiles = uploadedFiles
    
    if (stagedFiles.length > 0) {
      setUploading(true)
      filesToUpload = stagedFiles.map(sf => sf.file)
      
      // Update uploaded files list for UI
      const names = stagedFiles.map(sf => sf.name)
      currentUploadedFiles = [...uploadedFiles, ...names]
      setUploadedFiles(currentUploadedFiles)
      setStagedFiles([])
    }

    // Add placeholder message for agent response
    const agentMsgId = Date.now()
    const agentPlaceholder = { role: 'agent', content: '', ts: agentMsgId, streaming: true }
    const messagesWithPlaceholder = [...newMessages, agentPlaceholder]
    setMessages(messagesWithPlaceholder)

    setPrompt('')

    try {
      let finalMessages = messagesWithPlaceholder

      // Use HTTP SSE for streaming with multipart form data if files are present
      const httpController = new AbortController()
      setAbortController(httpController)

      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: selected,
          prompt: finalPrompt, // Use finalPrompt which includes history if enabled
          conv_id: convId
        },
        token,
        httpController.signal,
        filesToUpload // Pass files to the service
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Mark uploading as complete after successful request start
      if (stagedFiles.length > 0) {
        setUploading(false)
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
                  // Filter out "None" strings from content
                  const filteredContent = event.payload.content === 'None' ? '' : event.payload.content
                  
                  // Update the streaming message with new content (streaming mode)
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.ts === agentMsgId && msg.streaming
                        ? { ...msg, content: msg.content + filteredContent }
                        : msg
                    )
                    finalMessages = updated
                    return updated
                  })
                  
                  // Store audio data if present - accumulate audio chunks
                  if (event.payload.audio || event.payload.response_audio) {
                    setMessageAudio(prev => {
                      const existingAudio = prev[agentMsgId] || { audio: [], response_audio: null, transcript: '' }
                      
                      // Accumulate audio chunks if it's an array
                      let updatedAudio = existingAudio.audio || []
                      let updatedTranscript = existingAudio.transcript || ''
                      
                      if (event.payload.audio) {
                        if (Array.isArray(event.payload.audio)) {
                          updatedAudio = [...updatedAudio, ...event.payload.audio]
                          // Extract and accumulate transcripts
                          event.payload.audio.forEach(audioChunk => {
                            if (audioChunk.transcript && audioChunk.transcript !== 'None') {
                              updatedTranscript += audioChunk.transcript
                            }
                          })
                        } else {
                          updatedAudio = [...updatedAudio, event.payload.audio]
                          if (event.payload.audio.transcript && event.payload.audio.transcript !== 'None') {
                            updatedTranscript += event.payload.audio.transcript
                          }
                        }
                      }
                      
                      // Update response_audio (typically only one)
                      let updatedResponseAudio = existingAudio.response_audio
                      if (event.payload.response_audio) {
                        updatedResponseAudio = event.payload.response_audio
                      }
                      
                      const newAudioState = {
                        ...prev,
                        [agentMsgId]: {
                          audio: updatedAudio.length > 0 ? updatedAudio : undefined,
                          response_audio: updatedResponseAudio,
                          transcript: updatedTranscript
                        }
                      }
                      return newAudioState
                    })
                  }
                } else if (event.type === 'agent_response' && event.payload?.content) {
                  // Handle non-streaming response (complete response at once)
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.ts === agentMsgId
                        ? { ...msg, content: event.payload.content, streaming: false }
                        : msg
                    )
                    finalMessages = updated
                    return updated
                  })
                  
                  // Store audio data if present
                  if (event.payload.audio || event.payload.response_audio) {
                    setMessageAudio(prev => ({
                      ...prev,
                      [agentMsgId]: {
                        audio: event.payload.audio,
                        response_audio: event.payload.response_audio
                      }
                    }))
                  }
                } else if (event.type === 'agent_run_complete') {
                  // Mark streaming as complete - conversation saving is handled by backend
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.ts === agentMsgId
                        ? { ...msg, streaming: false }
                        : msg
                    )
                    finalMessages = updated
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
        return updated
      })
    } finally {
      setRunning(false)
      setUploading(false)
      setAbortController(null)
    }
  }, [selected, prompt, stagedFiles, uploadedFiles, messages, currentConversationId, sessionCollection, vectorCollectionName, token])

  const openHistory = async (page = 1) => {
  // Open history invoked

    // Only show full loading on initial open, not on pagination
    const isInitialLoad = !historyOpen
    
    if (isInitialLoad) {
      setHistoryOpen(true)
      setLoadingHistory(true)
    } else {
      setLoadingPagination(true)
    }
    
    try {
      // Use the provided page parameter directly
      const currentPage = page
      const pageSize = 5  // Fixed page size to match backend


      if (!token) {
        throw new Error('No authentication token available')
      }

      console.log('🎯 Selected agent for filtering:', selected)
      const params = {
        page: currentPage,
        page_size: pageSize,
        ...(selected && { agent_name: selected })
      }
      console.log('📡 API call params:', params)
      
      const result = await agentRuntimeService.listConversations(token, params)


      // Check if result has pagination structure
      if (result && result.conversations && result.pagination) {
  setConversations(result.conversations)
  setHistoryPagination(result.pagination)

        // Verify state was actually set (note: this might show old state due to async nature)
      } else if (Array.isArray(result)) {
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
  // History load completed
      setLoadingHistory(false)
      setLoadingPagination(false)
    }
  }

  const loadConversation = async (id) => {
    try {
      const conv = await agentRuntimeService.getConversation(id, token)
      
      setSelected(conv.agent_name)
      setMessages(conv.messages || [])
      setMessageAudio(conv.message_audio || {})  // Load audio data
      setUploadedFiles(conv.uploaded_files || [])
      setSessionCollection(conv.session_prefix || conv.session_collection || genUuidHex())
      setVectorCollectionName(conv.vector_collection_name || null) // Load the vector collection name
      setCurrentConversationId(conv.conversation_id)
      setHistoryOpen(false)
      
      // Set last user message from conversation history
      const lastUserMsg = (conv.messages || []).filter(msg => msg.role === 'user').pop()
      setLastUserMessage(lastUserMsg ? lastUserMsg.content : '')
    } catch (e) {
      console.error('load conversation failed', e)
    }
  }

  const deleteConversation = async (id, e) => {
    if (e) e.stopPropagation()
    try { await agentRuntimeService.deleteConversation(id, token) } catch { }
    setConversations(prev => prev.filter(c => c.conversation_id !== id))
  }

  const clearChat = useCallback(() => {
    setMessages([])
    setUploadedFiles([])
    setStagedFiles([])
    setCurrentConversationId(null)
    setSessionCollection(genUuidHex())
    setVectorCollectionName(null) // Reset vector collection name
    setLastUserMessage('') // Clear last user message when clearing chat
    setMessageAudio({}) // Clear audio data
  }, [])

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

  // Handle edit BPMN button click
  const handleEditBPMN = (bpmnXML) => {
    
    // Navigate to dashboard/bpmn with the XML data
    navigate('/dashboard/bpmn', {
      state: {
        initialBPMN: bpmnXML,
        editMode: true
      }
    })
    
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

  // Setup portal container once
  const portalRef = useRef(null)
  useEffect(() => {
    let el = document.getElementById('chat-input-portal')
    if (!el) {
      el = document.createElement('div')
      el.id = 'chat-input-portal'
      document.body.appendChild(el)
    }
    portalRef.current = el
  }, [])

  return (
  <Box ref={mainContainerRef} sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      maxWidth: 900, 
      mx: 'auto', 
      minHeight: { xs: 'calc(100dvh - 120px)', md: 'calc(100vh - 120px)' },
      // Dynamic spacer so bottom message never hides behind fixed input
      paddingBottom: `${inputHeight}px`
    }}>
      <Paper variant="section" elevation={0} square sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, background: 'transparent', boxShadow: 'none', border: 'none' }}>
        {/* Messages area */}
        <Box
          ref={scrollRef}
          sx={{ p: isSmall ? 1 : 2, overflow: 'visible', display: 'flex', flexDirection: 'column', gap: 1, mb: 4 }}
        >
          {messages.map((m, idx) => (
            <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase' }}>
                {m.role}{m.streaming ? ' (streaming...)' : ''}
              </Typography>
              {m.role === 'user' ? (
                <Typography variant="body2" dir="auto" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '90ch', unicodeBidi: 'plaintext' }}>
                  {m.content}
                </Typography>
              ) : (
                <>
                  <Box dir="auto" sx={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  maxWidth: '90ch',
                  wordBreak: 'break-word',
                  unicodeBidi: 'plaintext',
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
                    const jsxData = detectJSX(bpmnData.contentWithoutBPMN)
                    const imageData = detectBase64Images(jsxData.contentWithoutJSX)
                    
                    return (
                      <>
                        {/* Show markdown content (without BPMN, JSX blocks, and images) */}
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, ...props }) => (
                              <a {...props} target="_blank" rel="noopener noreferrer" />
                            ),
                            pre: ({ children, ...props }) => {
                              // Extract language from code element
                              let language = ''
                              let codeContent = ''
                              
                              if (children?.props?.className) {
                                language = children.props.className.replace('language-', '')
                                codeContent = children.props.children || ''
                              }
                              
                              // Get the actual code content from children for copying
                              const actualCode = typeof children?.props?.children === 'string' 
                                ? children.props.children 
                                : children?.toString?.() || ''
                              
                              // Create the full code block with backticks for copying
                              const fullCodeBlock = language 
                                ? `\`\`\`${language}\n${actualCode}\n\`\`\``
                                : actualCode
                              
                              return (
                                <Box
                                  component="pre"
                                  {...props}
                                  sx={{ 
                                    position: 'relative',
                                    p: 1, 
                                    bgcolor: 'action.hover', 
                                    borderRadius: 1, 
                                    overflowX: 'auto', 
                                    fontSize: 13, 
                                    lineHeight: 1.4,
                                    m: 0,
                                    '&:hover .copy-btn': { opacity: 1 }
                                  }}
                                >
                                  {/* Show ```language before the code */}
                                  {language && (
                                    <Box sx={{ 
                                      fontFamily: 'monospace',
                                      fontSize: '11px',
                                      color: 'text.secondary',
                                      opacity: 0.7,
                                      mb: 0.5,
                                      userSelect: 'none'
                                    }}>
                                      ```{language}
                                    </Box>
                                  )}
                                  
                                  {/* Copy button */}
                                  <IconButton
                                    className="copy-btn"
                                    size="small"
                                    onClick={() => navigator.clipboard.writeText(fullCodeBlock)}
                                    sx={{ 
                                      position: 'absolute', 
                                      top: 4, 
                                      right: 4,
                                      opacity: 0, 
                                      transition: 'opacity 0.2s',
                                      p: 0.5,
                                      minWidth: 0,
                                      width: 20,
                                      height: 20
                                    }}
                                  >
                                    <ContentCopyIcon sx={{ fontSize: 12 }} />
                                  </IconButton>
                                  
                                  {children}
                                  
                                  {/* Show closing ``` after the code */}
                                  {language && (
                                    <Box sx={{ 
                                      fontFamily: 'monospace',
                                      fontSize: '11px',
                                      color: 'text.secondary',
                                      opacity: 0.7,
                                      mt: 0.5,
                                      userSelect: 'none'
                                    }}>
                                      ```
                                    </Box>
                                  )}
                                </Box>
                              )
                            }
                          }}
                        >
                          {imageData.contentWithoutImages || jsxData.contentWithoutJSX || bpmnData.contentWithoutBPMN || m.content || '...'}
                        </ReactMarkdown>
                        
                        {/* Show base64 images if detected */}
                        {imageData.hasImages && (
                          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {imageData.images.map((img, idx) => (
                              <Box 
                                key={idx} 
                                sx={{ 
                                  border: '1px solid', 
                                  borderColor: 'divider', 
                                  borderRadius: 1, 
                                  overflow: 'hidden',
                                  maxWidth: 400,
                                  maxHeight: 400
                                }}
                              >
                                <img 
                                  src={img.src} 
                                  alt={`Image ${idx + 1}`}
                                  style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'contain',
                                    display: 'block'
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    console.error('Failed to load base64 image')
                                  }}
                                />
                              </Box>
                            ))}
                          </Box>
                        )}
                        
                        {/* Show JSX component if detected */}
                        {jsxData.hasJSX && (
                          <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              bgcolor: 'action.hover', 
                              px: 1, 
                              py: 0.5, 
                              borderBottom: '1px solid', 
                              borderColor: 'divider'
                            }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                JSX Component Preview
                              </Typography>
                            </Box>
                            <Box sx={{ p: 2 }}>
                              <DynamicComponent componentCode={jsxData.jsxCode} />
                            </Box>
                          </Box>
                        )}
                        
                        {/* Additionally show BPMN diagram if detected */}
                        {bpmnData.hasBPMN && (
                          <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                            <Box sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              bgcolor: 'action.hover', 
                              px: 1, 
                              py: 0.5, 
                              borderBottom: '1px solid', 
                              borderColor: 'divider'
                            }}>
                              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                BPMN Diagram Visualization
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<EditIcon />}
                                onClick={() => handleEditBPMN(bpmnData.bpmnXML)}
                                sx={{ 
                                  minWidth: 'auto',
                                  fontSize: '11px',
                                  textTransform: 'none',
                                  py: 0.25,
                                  px: 1
                                }}
                              >
                                Edit
                              </Button>
                            </Box>
                            <Box sx={{ position: 'relative', height: '500px', width: '100%' }}>
                              <BPMN 
                                readOnly={true}
                                showToolbox={false}
                                showPropertyPanel={false}
                                initialTheme={theme.palette.mode}
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
                                  // BPMN component loaded
                                }}
                              />
                            </Box>
                          </Box>
                        )}
                      </>
                    )
                  })()}
                </Box>
                
                {/* Audio Player - Show if this message has audio */}
                {(() => {
                  const audioData = messageAudio[m.ts]
                  
                  if (!audioData) {
                    return null
                  }
                  if (!audioData.audio && !audioData.response_audio) {
                    return null
                  }
                  
                  return (
                    <Box sx={{ mt: 1 }}>
                      {audioData.audio && Array.isArray(audioData.audio) && (
                        <AudioPlayer audioChunks={audioData.audio} />
                      )}
                      {audioData.transcript && audioData.transcript.trim() && (
                        <Box sx={{ 
                          mt: 1, 
                          p: 1.5, 
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider'
                        }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                            Audio Transcript:
                          </Typography>
                          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                            {audioData.transcript}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )
                })()}
                </>
              )}
            </Box>
          ))}
          {!autoScroll && !atBottom && messages.length > 0 && (
            <Box sx={{ position: 'sticky', bottom: 4, alignSelf: 'center' }}>
              <Tooltip title="Jump to latest" arrow placement="top" disableInteractive>
                <IconButton size="small" onClick={() => { 
                  window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'smooth'
                  });
                  setAutoScroll(true);
                }}
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

        {/* Input row moved to portal */}
        {portalRef.current && createPortal(
          <ChatInputBar
            prompt={prompt}
            setPrompt={setPrompt}
            selected={selected}
            running={running}
            runAgent={runAgent}
            cancelChat={cancelChat}
            stagedFiles={stagedFiles}
            uploadedFiles={uploadedFiles}
            uploading={uploading}
            setSelectorOpen={setSelectorOpen}
            handleFilesSelected={handleFilesSelected}
            lastUserMessage={lastUserMessage}
            setStagedFiles={setStagedFiles}
            openHistory={openHistory}
            clearChat={clearChat}
            onHeightChange={handleInputHeightChange}
            containerEl={mainContainerRef.current}
          />, portalRef.current
        )}
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
          <Box sx={{ mb: 1 }}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>Choose from available agents</Typography>
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
              <List sx={{ position: 'relative' }}>
                {conversations.map((c) => (
                  <Box key={c.conversation_id || c.id || Math.random()} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1, cursor: 'pointer', opacity: loadingPagination ? 0.6 : 1, transition: 'opacity 0.2s ease' }} onClick={() => loadConversation(c.conversation_id || c.id)}>
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
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, py: 2, position: 'relative' }}>
                  {loadingPagination && (
                    <Box sx={{ 
                      position: 'absolute', 
                      top: '50%', 
                      left: '50%', 
                      transform: 'translate(-50%, -50%)',
                      zIndex: 1
                    }}>
                      <CircularProgress size={20} />
                    </Box>
                  )}
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
                    disabled={loadingPagination}
                    sx={{ opacity: loadingPagination ? 0.3 : 1, transition: 'opacity 0.2s ease' }}
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

// Portal Chat Input Bar (isolated from main message re-renders to reduce flicker)
const ChatInputBar = React.memo(function ChatInputBar({
  prompt,
  setPrompt,
  selected,
  running,
  runAgent,
  cancelChat,
  stagedFiles,
  uploadedFiles,
  uploading,
  setSelectorOpen,
  handleFilesSelected,
  lastUserMessage,
  setStagedFiles,
  openHistory,
  clearChat,
  onHeightChange,
  containerEl
}) {
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const [alignedStyle, setAlignedStyle] = useState({ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 650 })
  
  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState({ x: null, y: null }) // null means use default positioning

  // Measure and report height upward
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      onHeightChange(rect.height + 24) // include spacer buffer
      
      // Only set aligned style if not dragged to a custom position
      if (position.x === null && position.y === null && containerEl) {
        const parentRect = containerEl.getBoundingClientRect()
        // Keep original maxWidth (650) but align center to parent center
        const desiredWidth = Math.min(650, parentRect.width)
        const parentCenter = parentRect.left + parentRect.width / 2
        const left = parentCenter - desiredWidth / 2
        setAlignedStyle({
          position: 'fixed',
          left: `${left}px`,
          width: `${desiredWidth}px`,
          maxWidth: `${desiredWidth}px`,
          transform: 'none'
        })
      }
    }
    measure()
    let ro
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      if (containerEl) ro.observe(containerEl)
    } else {
      window.addEventListener('resize', measure)
    }
    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', measure)
    }
  }, [onHeightChange, stagedFiles, uploadedFiles, running, prompt, containerEl, position])

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('input, textarea, button, .MuiIconButton-root')) {
      return // Don't start drag on interactive elements
    }
    
    setIsDragging(true)
    const rect = containerRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    e.preventDefault()
  }

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y
    
    // Constrain to viewport
    const maxX = window.innerWidth - 300 // min width for input
    const maxY = window.innerHeight - 100 // min height for input
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    })
  }, [isDragging, dragOffset])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Restore focus to input after streaming completes
  useEffect(() => {
    if (!running && inputRef.current) {
      // Small delay to ensure DOM is stable after streaming
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [running])

  // Double-click to reset position
  const handleDoubleClick = () => {
    setPosition({ x: null, y: null })
  }

  // Normalize pasted text to NFC; preserve caret and support complex scripts
  const handlePaste = useCallback((e) => {
    const clip = e.clipboardData || window.clipboardData
    const text = clip?.getData('text')
    if (!text) return
    e.preventDefault()
    const normalized = text.normalize ? text.normalize('NFC') : text
    const inputEl = inputRef.current
    const start = (inputEl && typeof inputEl.selectionStart === 'number') ? inputEl.selectionStart : prompt.length
    const end = (inputEl && typeof inputEl.selectionEnd === 'number') ? inputEl.selectionEnd : prompt.length
    const next = prompt.slice(0, start) + normalized + prompt.slice(end)
    setPrompt(next)
    // restore caret after React updates value
    setTimeout(() => {
      try {
        if (inputRef.current) {
          const pos = start + normalized.length
          inputRef.current.selectionStart = pos
          inputRef.current.selectionEnd = pos
        }
      } catch {}
    }, 0)
  }, [prompt, setPrompt])

  // Calculate final style
  const finalStyle = position.x !== null && position.y !== null ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: '650px',
    maxWidth: '650px',
    transform: 'none'
  } : {
    ...alignedStyle,
    bottom: 40
  }

  return (
    <Box 
      ref={containerRef} 
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      sx={{
        backgroundColor: 'background.paper',
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        p: 1.5,
        zIndex: 1200,
        boxShadow: 4,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        // dynamic alignment style overrides
        ...finalStyle,
        // Add visual feedback for dragging
        opacity: isDragging ? 0.9 : 1,
        transform: isDragging ? 'scale(1.02)' : finalStyle.transform,
        transition: isDragging ? 'none' : 'transform 0.1s ease, opacity 0.1s ease'
      }}
      title="Drag to reposition, double-click to reset position"
    >
      <Box sx={{ position: 'relative' }}>
        <TextField
          inputRef={inputRef}
          placeholder={!selected ? 'Select an agent first' : (stagedFiles.length ? `Type your message... (${stagedFiles.length} file(s) ready) • Shift+Enter to send` : 'Type your message... • Shift+Enter to send')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) {
              e.preventDefault()
              runAgent()
            } else if (e.key === 'ArrowUp' && prompt === '' && lastUserMessage) {
              e.preventDefault()
              setPrompt(lastUserMessage)
            }
          }}
          fullWidth
          multiline
          minRows={1}
          maxRows={10}
          disabled={!selected || running}
          size="small"
          autoFocus
          inputProps={{ dir: 'auto', style: { unicodeBidi: 'plaintext', fontFamily: 'inherit' } }}
          sx={{ 
            '& .MuiInputBase-root': { 
              pr: running ? 14 : 8, 
              fontSize: '14px', 
              alignItems: 'flex-start',
              cursor: 'text' // Override parent cursor for text input
            } 
          }}
          onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking in text field
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

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Button
          variant="text"
          size="small"
          onClick={() => setSelectorOpen(true)}
          disabled={running}
          startIcon={<MenuIcon />}
          sx={{ textTransform: 'none', fontSize: '12px', minWidth: 'auto', px: 1 }}
        >
          {selected ? selected.replace(/\.json$/, '').slice(0, 15) + (selected.replace(/\.json$/, '').length > 15 ? '...' : '') : 'Agent'}
        </Button>

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

        {stagedFiles.map((f, idx) => (
          <Chip key={`${f.name}-${idx}`} size="small" color="primary" variant="outlined" label={f.name.length > 15 ? f.name.slice(0, 12) + '...' : f.name} onDelete={() => setStagedFiles(prev => prev.filter((_, i) => i !== idx))} sx={{ height: 20, fontSize: '10px' }} />
        ))}
        {uploadedFiles.map((name, idx) => (
          <Chip key={`up-${name}-${idx}`} size="small" color="success" variant="filled" label={name.length > 15 ? name.slice(0, 12) + '...' : name} sx={{ height: 20, fontSize: '10px' }} />
        ))}

        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={() => openHistory()} title="History"><HistoryIcon fontSize="small" /></IconButton>
        <Button size="small" onClick={clearChat} color="error">Clear</Button>
      </Box>
    </Box>
  )
})
