import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  TextField,
  Typography,
  Autocomplete,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TablePagination,
  FormControlLabel,
  Checkbox
} from '@mui/material'
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon, Play as PlayIcon } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'

import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'

export default function Agent({ user }) {
  // removed render debug log
  
  const token = user?.token
  const navigate = useNavigate()
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token])

  // Add ref to track if component is mounted and cancel pending requests
  const isMountedRef = useRef(true)
  const currentRequestRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pagination, setPagination] = useState({
    page: 0, // MUI uses 0-based pagination
    rowsPerPage: 8,
    total: 0,
    totalPages: 0
  })

  // Store full objects (id + name) then map IDs in the form
  const [models, setModels] = useState([]) // [{id,name}]
  const [tools, setTools] = useState([])   // [{id,name}]
  const [categories, setCategories] = useState([])
  const [knowledgeCollections, setKnowledgeCollections] = useState([]) // [{id,name}]
  const [existingAgents, setExistingAgents] = useState([])

  const [form, setForm] = useState({
    id: null,
    name: '',
    category: '',
    description: '',
    instructions: '',
    // Store only IDs for all references
    model_id: '',                    // single model ID
    tools: {},                       // keys are tool IDs
    knowledge_collections: {},       // keys are knowledge collection IDs
    memory: { history: { enabled: false, num: 3 } },
    stream: true,                    // stream enabled by default
  })

  // Form validation errors
  const [errors, setErrors] = useState({
    name: '',
    model_id: '',
  })

  const toolList = Object.keys(form.tools || {}) // IDs
  const knowledgeList = Object.keys(form.knowledge_collections || {}) // IDs

  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      category: '',
      description: '',
      instructions: '',
      model_id: '',
      tools: {},
      knowledge_collections: {},
      memory: { history: { enabled: false, num: 3 } },
      stream: true,
    })
    setErrors({
      name: '',
      model_id: '',
    })
  }

  const validateForm = () => {
    const newErrors = {
      name: '',
      model_id: '',
    }

    if (!form.name || form.name.trim() === '') {
      newErrors.name = 'Agent name is required'
    }

    if (!form.model_id) {
      newErrors.model_id = 'Model configuration is required'
    }

    setErrors(newErrors)
    return !newErrors.name && !newErrors.model_id
  }

  const fetchAll = useCallback(async (page = 1, pageSize = 8) => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate calls
    if (loading) {
      return;
    }
    
    // Cancel any pending request
    if (currentRequestRef.current) {
      currentRequestRef.current.abort()
    }

    setLoading(true)
    try {
      // Build query parameters for agents with pagination
      const agentsQueryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: 'created_at',
        sort_order: 'desc'
      });

      // Use the singleton service for all API calls to prevent duplicates
      // For dropdowns, use the /all endpoints to get all items with minimal fields
      const [agentsResult, modelsResult, toolsResult, knowledgeResult] = await Promise.all([
        sharedApiService.makeRequest(
          `/api/agents?${agentsQueryParams}`,
          { headers: authHeaders },
          { page, pageSize, token: token?.substring(0, 10) }
        ),
        sharedApiService.makeRequest(
          `/api/models/configs/all`,
          { headers: authHeaders },
          { token: token?.substring(0, 10), bypassCache: true }
        ),
        sharedApiService.makeRequest(
          `/api/tools/configs/all`,
          { headers: authHeaders },
          { token: token?.substring(0, 10), bypassCache: true }
        ),
        sharedApiService.makeRequest(
          `/api/knowledge/collections/all`,
          { headers: authHeaders },
          { token: token?.substring(0, 10), bypassCache: true }
        )
      ])

      // Check if component is still mounted
      if (!isMountedRef.current) {
        return
      }

      // Handle agents with pagination
      if (agentsResult.success) {
        const agentsData = agentsResult.data
        const agentsList = agentsData.agents || []
        setExistingAgents(agentsList)

        // Set pagination data
        if (agentsData.pagination) {
          setPagination({
            page: agentsData.pagination.page - 1, // Convert to 0-based for MUI
            rowsPerPage: agentsData.pagination.page_size,
            total: agentsData.pagination.total,
            totalPages: agentsData.pagination.total_pages
          });
        }

        // Extract unique categories from existing agents
        const uniqueCategories = new Set()
        agentsList.forEach(agent => {
          if (agent.category) {
            uniqueCategories.add(agent.category)
          }
        })
        setCategories(Array.from(uniqueCategories).sort())
      } else {
        console.error('Failed to fetch agents:', agentsResult.error)
        showError('Failed to load agents')
      }

      // Handle models
      if (modelsResult.success) {
        const modelsData = modelsResult.data
        const modelsList = modelsData.configurations || []
        setModels(modelsList.map(m => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        console.error('Failed to fetch models:', modelsResult.error)
        showError('Failed to load models')
      }

      // Handle tools
      if (toolsResult.success) {
        const toolsData = toolsResult.data
        const toolsList = toolsData.configurations || []
        setTools(toolsList.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        console.error('Failed to fetch tools:', toolsResult.error)
        showError('Failed to load tools')
      }

      // Handle knowledge collections
      if (knowledgeResult.success) {
        const knowledgeData = knowledgeResult.data
        const configsList = knowledgeData.configurations || []
        // Use knowledge config objects with proper IDs
        setKnowledgeCollections(configsList.map(c => ({ id: c.id, name: c.collection || c.name })).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        console.error('Failed to fetch knowledge collections:', knowledgeResult.error)
        showError('Failed to load knowledge collections')
      }
    } catch (e) {
      console.error(e)
      if (isMountedRef.current) {
        showError('Failed to load data')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
      // Clear the current request ref
      currentRequestRef.current = null
    }
  }, [authHeaders, showError, loading, token]) // Add dependencies

  const handlePageChange = (event, newPage) => {
    if (!loading && !saving) {
      fetchAll(newPage + 1, pagination.rowsPerPage); // Convert to 1-based for API
    }
  };

  const handleRowsPerPageChange = (event) => {
    if (!loading && !saving) {
      const newRowsPerPage = parseInt(event.target.value, 10);
      fetchAll(1, newRowsPerPage); // Reset to first page
    }
  };

  useEffect(() => { 
    // removed mount log
    
    // Set mounted to true
    isMountedRef.current = true;
    
    // Always load on mount
    fetchAll() 
  }, [token]) // Only depend on token

  // Cleanup function to handle component unmount
  useEffect(() => {
    // Initialize as mounted
    isMountedRef.current = true;
    
    return () => {
  // removed unmount log
      // Set mounted to false FIRST to prevent any state updates
      isMountedRef.current = false
      if (currentRequestRef.current) {
        currentRequestRef.current.abort()
      }
    }
  }, [])

  const loadAgent = (agent) => {
    if (!agent) return
    
    // Handle backward compatibility for knowledge collections
    let knowledgeCollections = agent.knowledge_collections || agent.collections || {}
    
    // If using old single collection format, convert to new multiple format
    if (!Object.keys(knowledgeCollections).length && agent.collection) {
      if (typeof agent.collection === 'object' && agent.collection.id) {
        knowledgeCollections = { [agent.collection.id]: {} }
      } else if (typeof agent.collection === 'string' && agent.collection) {
        knowledgeCollections = { [agent.collection]: {} }
      }
    }
    
    setForm({
      id: agent.id || null,
      name: agent.name || '',
      category: agent.category || '',
      description: agent.description || '',
      instructions: agent.instructions || '',
      model_id: agent.model?.id || '',
      tools: agent.tools || {}, // assume already keyed by ID
      knowledge_collections: knowledgeCollections,
      memory: agent.memory || { history: { enabled: false, num: 3 } },
      stream: agent.stream !== undefined ? agent.stream : true,
    })
  }

  const handleSave = async () => {
    // Validate form before saving
    if (!validateForm()) {
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category: form.category,
        description: form.description,
        instructions: form.instructions,
        model: form.model_id ? { id: form.model_id } : null,
        tools: form.tools,
        collections: form.knowledge_collections,
        memory: form.memory,
        stream: form.stream,
      }
      
      // Include ID only if editing an existing agent
      if (form.id) {
        payload.id = form.id
      }
      
      // Use PUT method for updates, POST for creates
      const method = form.id ? 'PUT' : 'POST'
      const endpoint = form.id ? `/api/agents/id/${form.id}` : `/api/agents`
      
      const resp = await apiCall(endpoint, {
        method: method,
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Save failed (${resp.status})`)
      showSuccess(`Agent ${data.name} ${form.id ? 'updated' : 'created'} successfully`)
      
      // Invalidate cache after successful save
      sharedApiService.invalidateCache('/api/agents');
      sharedApiService.invalidateCache('/api/models/configs');
      sharedApiService.invalidateCache('/api/tools/configs');
      sharedApiService.invalidateCache('/api/knowledge/configs');
      
      // Only refresh if component is still mounted and not already loading
      if (isMountedRef.current && !loading) {
        await fetchAll(pagination.page + 1, pagination.rowsPerPage) // Refresh current page
      }
      setDialogOpen(false)
    } catch (e) {
      showError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id || !form.name) return

    const confirmed = await showDeleteConfirmation({
      itemName: form.name,
      itemType: 'agent',
    })

    if (!confirmed) return

    setSaving(true)
    try {
      const resp = await apiCall(`/api/agents/id/${form.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Delete failed (${resp.status})`)
      showSuccess(`Agent ${form.name} deleted`)
      
      // Invalidate cache after successful delete
      sharedApiService.invalidateCache('/api/agents');
      sharedApiService.invalidateCache('/api/models/configs');
      sharedApiService.invalidateCache('/api/tools/configs');
      sharedApiService.invalidateCache('/api/knowledge/configs');
      
      setForm(f => ({ ...f, id: null, name: '' }))
      // Only refresh if component is still mounted and not already loading
      if (isMountedRef.current && !loading) {
        await fetchAll(pagination.page + 1, pagination.rowsPerPage) // Refresh current page
      }
      setDialogOpen(false)
    } catch (e) {
      showError(e.message || 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (agent) => {
    loadAgent(agent)
    // Clear any validation errors
    setErrors({
      name: '',
      model_id: '',
    })
    setDialogOpen(true)
  }

  const navigateToPlayground = (agentName) => {
    navigate(`/dashboard/agent-playground?agent=${encodeURIComponent(agentName)}`)
  }

  return (
    <Box>
      {(loading || saving) && (
        <Box sx={{ mb: 2, height: 4, borderRadius: 1, bgcolor: 'action.hover' }} />
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Agents Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage AI agents configured with models, tools, and knowledge.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>
            Create Agent
          </Button>
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              All Agents ({pagination.total} total, showing {existingAgents.length} on page {pagination.page + 1})
            </Typography>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell>Tools</TableCell>
                  <TableCell>Knowledge</TableCell>
                  <TableCell>Memory</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {existingAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                          No agents found
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Create your first agent to get started.
                        </Typography>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                          Create Agent
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  existingAgents.map((a) => {
                    const toolIds = Object.keys(a.tools || {})
                    
                    // Handle backward compatibility for knowledge collections display
                    let knowledgeCollectionsObj = a.knowledge_collections || a.collections || {}
                    if (!Object.keys(knowledgeCollectionsObj).length && a.collection) {
                      if (typeof a.collection === 'object' && a.collection.id) {
                        knowledgeCollectionsObj = { [a.collection.id]: a.collection }
                      } else if (typeof a.collection === 'string' && a.collection) {
                        knowledgeCollectionsObj = { [a.collection]: { name: a.collection } }
                      }
                    }
                    const knowledgeIds = Object.keys(knowledgeCollectionsObj)
                    
                    const mem = a.memory?.history?.enabled
                      ? `History (${a.memory?.history?.num ?? 3})`
                      : 'Off'
                    return (
                      <TableRow 
                        key={a.id || a.name} 
                        hover 
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigateToPlayground(a.name)}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">{a.name}</Typography>
                          {a.description && (
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2,
                                maxHeight: '3.6em' // 3 lines * 1.2 line-height
                              }}
                            >
                              {a.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{a.category || '-'}</TableCell>
                        <TableCell>{a.model?.name || a.model?.id || '-'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {toolIds.length === 0 ? (
                              <Chip size="small" label="None" />
                            ) : (
                              toolIds.slice(0, 3).map(tid => {
                                const toolName = a.tools[tid]?.name || tid
                                return (
                                  <Chip key={tid} size="small" label={toolName} variant="outlined" />
                                )
                              })
                            )}
                            {toolIds.length > 3 && (
                              <Chip size="small" label={`+${toolIds.length - 3}`} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {knowledgeIds.length === 0 ? (
                              <Chip size="small" label="None" />
                            ) : (
                              knowledgeIds.slice(0, 3).map(kid => {
                                const knowledgeName = knowledgeCollectionsObj[kid]?.name || kid
                                return (
                                  <Chip key={kid} size="small" label={knowledgeName} variant="outlined" />
                                )
                              })
                            )}
                            {knowledgeIds.length > 3 && (
                              <Chip size="small" label={`+${knowledgeIds.length - 3}`} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={mem} color={a.memory?.history?.enabled ? 'primary' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton 
                            size="small" 
                            color="primary" 
                            onClick={(e) => {
                              e.stopPropagation()
                              openEdit(a)
                            }}
                          >
                            <EditIcon size={16} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page}
            onPageChange={handlePageChange}
            rowsPerPage={pagination.rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[5, 8, 10, 15, 25]}
            showFirstButton
            showLastButton
          />
        </CardContent>
      </Card>

      <Dialog 
        open={dialogOpen} 
        onClose={() => {
          setDialogOpen(false)
          // Clear errors when dialog is closed
          setErrors({ name: '', model_id: '' })
        }} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>{form.id ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3} sx={{ mt: 0 }}>
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Autocomplete
                  freeSolo
                  options={existingAgents.map(a => a.name)}
                  value={form.name}
                  onChange={(_, v) => {
                    // Clear error when user changes the field
                    if (errors.name) {
                      setErrors(prev => ({ ...prev, name: '' }))
                    }
                    // If selecting from dropdown and it's different from current agent, load it
                    if (v && existingAgents.some(a => a.name === v)) {
                      const agent = existingAgents.find(a => a.name === v)
                      // Only load if it's a different agent (different ID) or we're creating new
                      if (agent && (!form.id || agent.id !== form.id)) {
                        loadAgent(agent)
                      }
                    } else {
                      // Just update the name, keep the existing agent data
                      setForm(f => ({ ...f, name: v || '' }))
                    }
                  }}
                  onInputChange={(_, v, reason) => {
                    // Clear error when user types
                    if (errors.name) {
                      setErrors(prev => ({ ...prev, name: '' }))
                    }
                    // Only update the form name while typing, don't load agent
                    // This allows renaming without triggering agent load
                    if (reason === 'input') {
                      setForm(f => ({ ...f, name: v || '' }))
                    }
                  }}
                  renderInput={(p) => 
                    <TextField 
                      {...p} 
                      label="Agent Name" 
                      size="small" 
                      required 
                      error={!!errors.name}
                      helperText={errors.name}
                    />
                  }
                />

                <Autocomplete
                  freeSolo
                  options={categories}
                  value={form.category}
                  onChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
                  onInputChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
                  renderInput={(p) => <TextField {...p} label="Category" size="small" />}
                />

                <TextField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} multiline minRows={2} />
                <TextField label="Instructions" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} multiline minRows={4} />
              </Stack>
            </Grid>

            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Autocomplete
                  options={models}
                  getOptionLabel={(o) => o?.name || ''}
                  value={models.find(m => m.id === form.model_id) || null}
                  onChange={(_, v) => {
                    // Clear error when user changes the field
                    if (errors.model_id) {
                      setErrors(prev => ({ ...prev, model_id: '' }))
                    }
                    setForm(f => ({ ...f, model_id: v?.id || '' }))
                  }}
                  renderInput={(p) => 
                    <TextField 
                      {...p} 
                      label="Model Configuration" 
                      size="small" 
                      required
                      error={!!errors.model_id}
                      helperText={errors.model_id}
                    />
                  }
                />

                <Autocomplete
                  multiple
                  options={tools}
                  getOptionLabel={(o) => o?.name || ''}
                  value={tools.filter(t => toolList.includes(t.id))}
                  onChange={(_, v) => {
                    const next = {}
                    v.forEach(t => { next[t.id] = form.tools?.[t.id] || {} })
                    setForm(f => ({ ...f, tools: next }))
                  }}
                  renderTags={(value, getTagProps) => value.map((opt, i) => <Chip {...getTagProps({ index: i })} key={opt.id} size="small" label={opt.name} />)}
                  renderInput={(p) => <TextField {...p} label="Tools" size="small" />}
                />

                <Autocomplete
                  multiple
                  options={knowledgeCollections}
                  getOptionLabel={(o) => o?.name || ''}
                  value={knowledgeCollections.filter(c => knowledgeList.includes(c.id))}
                  onChange={(_, v) => {
                    const next = {}
                    v.forEach(c => { next[c.id] = form.knowledge_collections?.[c.id] || {} })
                    setForm(f => ({ ...f, knowledge_collections: next }))
                  }}
                  renderTags={(value, getTagProps) => value.map((opt, i) => <Chip {...getTagProps({ index: i })} key={opt.id} size="small" label={opt.name} />)}
                  renderInput={(p) => <TextField {...p} label="Knowledge Collections" size="small" />}
                />

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Memory</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant={form.memory?.history?.enabled ? 'contained' : 'outlined'}
                      onClick={() => setForm(f => ({ ...f, memory: { ...(f.memory || {}), history: { enabled: !f.memory?.history?.enabled, num: f.memory?.history?.num ?? 3 } } }))}
                    >
                      History {form.memory?.history?.enabled ? 'On' : 'Off'}
                    </Button>
                    {form.memory?.history?.enabled && (
                      <TextField
                        type="number"
                        size="small"
                        label="Num"
                        value={form.memory?.history?.num ?? 3}
                        onChange={e => setForm(f => ({ ...f, memory: { ...(f.memory || {}), history: { enabled: true, num: Number(e.target.value || 0) } } }))}
                        sx={{ width: 120 }}
                      />
                    )}
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Streaming</Typography>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={form.stream}
                        onChange={(e) => setForm(f => ({ ...f, stream: e.target.checked }))}
                      />
                    }
                    label="Enable streaming responses"
                  />
                </Paper>
              </Stack>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          {form.id && (
            <Button color="error" onClick={handleDelete} disabled={saving} startIcon={<DeleteIcon size={16} />}>Delete</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button 
            onClick={() => {
              setDialogOpen(false)
              // Clear errors when dialog is closed
              setErrors({ name: '', model_id: '' })
            }} 
            disabled={saving}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save Agent'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
