import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  TextField,
  Button,
  Autocomplete,
  LinearProgress,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Fade,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Stack
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from 'lucide-react'
import { apiCall } from '../config/api'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'

const api = {
  async getDefaults(token) {
    const r = await apiCall('/api/knowledge/defaults', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getCategories(token) {
    const r = await apiCall('/api/knowledge/categories', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getCollections(token) {
    const r = await apiCall('/api/knowledge/collections', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getCollection(collection, token) {
    const r = await apiCall(`/api/knowledge/collection/${encodeURIComponent(collection)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!r.ok) throw new Error('Failed to load collection')
    return r.json()
  },
  async saveCollection(body, token) {
    const r = await apiCall('/api/knowledge/collection/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
    return r.json()
  },
  async deleteCollection(collection, token) {
    const r = await apiCall(`/api/knowledge/collection/${encodeURIComponent(collection)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!r.ok) throw new Error('Delete failed')
    return r.json()
  },
  async uploadFiles(collection, files, token, payload = null) {
    const fd = new FormData()
    fd.append('collection', collection)
    for (const f of files) fd.append('files', f)
    if (payload) {
      fd.append('payload', JSON.stringify(payload))
    }
    const r = await apiCall(`/api/knowledge/upload?collection=${encodeURIComponent(collection)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
  async deleteFile(collection, filename, token) {
    const r = await apiCall(`/api/knowledge/collection/${encodeURIComponent(collection)}/file/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!r.ok) throw new Error('Failed to delete file')
    return r.json()
  },
  async discoverChunking(token) {
    const r = await apiCall('/api/knowledge/components?folder=ai.chunking', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return r.json()
  },
  async discoverEmbedders(token) {
    const r = await apiCall('/api/knowledge/components?folder=ai.embeddings', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return r.json()
  },
  async introspect(module_path, token) {
    console.log('[API] Introspecting module_path:', module_path)
    const r = await apiCall('/api/knowledge/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ module_path, kind: 'chunk' })
    })
    const result = await r.json()
    console.log('[API] Introspection response:', result)
    return result
  }
}

export default function KnowledgeConfig({ user }) {
  const theme = useTheme()
  const token = user?.token
  const { showSuccess, showError, showWarning } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const [loading, setLoading] = useState(true)
  const [collections, setCollections] = useState([])
  const [existingConfigs, setExistingConfigs] = useState([]) // Full collection configurations like ToolConfig
  const [loadingConfigs, setLoadingConfigs] = useState(true)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [components, setComponents] = useState({ chunking: [], embedders: [] })
  const [introspection, setIntrospection] = useState({})
  const [defaults, setDefaults] = useState({ chunk_size: 5000, chunk_overlap: 0 })
  const [isEdit, setIsEdit] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)

  const [form, setForm] = useState({
    id: null,
    name: '',
    category: '',
    chunk_strategy: '',
    chunk_strategy_params: {},
    chunk_size: null,
    chunk_overlap: null,
    embedder_strategy: '',
    embedder_strategy_params: {}
  })

  const [pendingFiles, setPendingFiles] = useState([])
  const [existingFiles, setExistingFiles] = useState([]) // Files already in the collection
  const [filesToDelete, setFilesToDelete] = useState([]) // Files marked for deletion
  const [saveBusy, setSaveBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saveState, setSaveState] = useState({ loading: false })

  const loadCategories = async () => {
    try {
      setLoadingCategories(true)
      const response = await api.getCategories(token)
      setCategories(response.categories || [])
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load categories:', error)
    } finally {
      setLoadingCategories(false)
    }
  }

  const loadExistingConfigs = async () => {
    try {
      setLoadingConfigs(true)
      const collectionsResponse = await api.getCollections(token)
      const collectionNames = collectionsResponse.collections || []
      setCollections(collectionNames)
      
      // Load full data for each collection like ToolConfig loads configurations
      const collectionsWithData = []
      for (const name of collectionNames) {
        try {
          const data = await api.getCollection(name, token)
          
          // Extract chunk configuration - prefer from embedder.chunk, fallback to root chunk
          const chunkConfig = data.embedder?.chunk || data.chunk || {}
          
          collectionsWithData.push({
            id: name, // Use collection name as id like ToolConfig
            name: data.collection || name,
            category: data.category || '',
            chunk_strategy: chunkConfig.strategy || '',
            chunk_strategy_params: chunkConfig.params || {},
            chunk_size: chunkConfig.chunk_size || null,
            chunk_overlap: chunkConfig.chunk_overlap || null,
            embedder_strategy: data.embedder?.strategy || '',
            embedder_strategy_params: data.embedder?.params || {},
            files: data.files || [] // Include files from the collection
          })
        } catch (error) {
          console.error(`[KnowledgeConfig] Failed to load collection ${name}:`, error)
          // Add basic entry if collection data can't be loaded
          collectionsWithData.push({
            id: name,
            name: name,
            category: '',
            chunk_strategy: '',
            chunk_strategy_params: {},
            chunk_size: null,
            chunk_overlap: null,
            embedder_strategy: '',
            embedder_strategy_params: {},
            files: [] // Empty files array for failed loads
          })
        }
      }
      setExistingConfigs(collectionsWithData)
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load collections:', error)
    } finally {
      setLoadingConfigs(false)
    }
  }

  useEffect(() => {
    // Load data like ToolConfig does
    const loadData = async () => {
      console.log('[KnowledgeConfig] Starting data load...')
      try {
        setLoading(true)
        
        // Load defaults and components first
        const [d, comps, embedderComps] = await Promise.all([
          api.getDefaults(token),
          api.discoverChunking(token),
          api.discoverEmbedders(token)
        ])
        
        console.log('[KnowledgeConfig] API responses:', { d, comps, embedderComps })
        setDefaults(d.defaults || {})
        
        // Process chunking components
        const chunkingData = comps.components?.['ai.chunking'] || {}
        const chunkingComponents = chunkingData['ai.chunking'] || chunkingData['chunking'] || []
        
        // Process embedder components
        const embedderData = embedderComps.components?.['ai.embeddings'] || {}
        const embedderComponents = embedderData['ai.embeddings'] || embedderData['embeddings'] || []
        
        setComponents({ 
          chunking: Array.isArray(chunkingComponents) ? chunkingComponents : [],
          embedders: Array.isArray(embedderComponents) ? embedderComponents : []
        })
        
        // Load configs and categories like ToolConfig
        await Promise.all([
          loadExistingConfigs(),
          loadCategories()
        ])
        
      } catch (err) {
        console.error('[KnowledgeConfig] Error loading data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [token])

  useEffect(() => {
    if (form.chunk_strategy && !introspection[form.chunk_strategy]) {
      console.log('[KnowledgeConfig] Introspecting chunk strategy:', form.chunk_strategy)
      api.introspect(form.chunk_strategy, token).then(info => {
        console.log('[KnowledgeConfig] Introspection result:', info)
        setIntrospection(prev => ({ ...prev, [form.chunk_strategy]: info }))
      }).catch(err => {
        console.error('[KnowledgeConfig] Introspection error:', err)
      })
    }
  }, [form.chunk_strategy, token])

  useEffect(() => {
    if (form.embedder_strategy && !introspection[form.embedder_strategy]) {
      console.log('[KnowledgeConfig] Introspecting embedder strategy:', form.embedder_strategy)
      api.introspect(form.embedder_strategy, token).then(info => {
        console.log('[KnowledgeConfig] Embedder introspection result:', info)
        setIntrospection(prev => ({ ...prev, [form.embedder_strategy]: info }))
      }).catch(err => {
        console.error('[KnowledgeConfig] Embedder introspection error:', err)
      })
    }
  }, [form.embedder_strategy, token])

  async function loadExistingConfig(configName) {
    const config = existingConfigs.find(c => c.name === configName)
    if (config) {
      console.log('[KnowledgeConfig] Loading config:', config) // Keep this debug temporarily
      setForm({
        ...config,
        id: config.id,
        name: config.name,
        category: config.category || '',
        chunk_strategy: config.chunk_strategy || '',
        chunk_strategy_params: config.chunk_strategy_params || {},
        chunk_size: config.chunk_size || null,
        chunk_overlap: config.chunk_overlap || null,
        embedder_strategy: config.embedder_strategy || '',
        embedder_strategy_params: config.embedder_strategy_params || {}
      })
      setIsEditMode(true)
      setIsEdit(true)
      
      // Set existing files from config data
      console.log('[KnowledgeConfig] Setting existing files to:', config.files)
      setExistingFiles(config.files || [])
      setFilesToDelete([])
    } else {
      setForm({ 
        id: null, 
        name: configName, 
        category: '', 
        chunk_strategy: '', 
        chunk_strategy_params: {},
        chunk_size: null,
        chunk_overlap: null,
        embedder_strategy: '',
        embedder_strategy_params: {}
      })
      setIsEditMode(false)
      setIsEdit(false)
      setExistingFiles([])
      setFilesToDelete([])
    }
  }

  const save = async () => {
    if (!form.name) {
      showError('Collection name is required')
      return
    }
    
    // Validate embedder strategy is required when files are present
    if ((existingFiles.length > 0 || pendingFiles.length > 0) && !form.embedder_strategy) {
      showError('Embedder strategy is required when files are present')
      return
    }
    
    setSaveState(s => ({ ...s, loading: true }))
    setSaveBusy(true)
    
    try {
      // Delete files marked for deletion first
      if (filesToDelete.length > 0) {
        for (const filename of filesToDelete) {
          try {
            await api.deleteFile(form.name, filename, token)
          } catch (error) {
            console.error(`Failed to delete file ${filename}:`, error)
            showWarning(`Failed to delete file: ${filename}`)
          }
        }
      }

      const payload = {
        collection: form.name,
        category: form.category || '',
        overwrite: isEdit,
        embedder: form.embedder_strategy ? {
          strategy: form.embedder_strategy,
          params: form.embedder_strategy_params || {},
          chunk: {
            strategy: form.chunk_strategy || '',
            params: form.chunk_strategy_params || {},
            ...(form.chunk_size !== null && { chunk_size: form.chunk_size }),
            ...(form.chunk_overlap !== null && { chunk_overlap: form.chunk_overlap })
          }
        } : undefined
      }
      
      const res = await api.saveCollection(payload, token)
      
      if (pendingFiles.length > 0) {
        await api.uploadFiles(form.name, pendingFiles, token, payload)
        setPendingFiles([])
      }
      
      if (res.exists) {
        // Save again forcing overwrite
        await api.saveCollection({ ...payload, overwrite: true }, token)
      }
      
      const action = isEdit ? 'updated' : 'saved'
      showSuccess(`Knowledge collection "${form.name}" ${action} successfully`)
      
      // Reload data like ToolConfig
      await Promise.all([
        loadExistingConfigs(),
        loadCategories()
      ])
      
      // Reset form and close dialog
      setForm({ 
        id: null, 
        name: '', 
        category: '', 
        chunk_strategy: '', 
        chunk_strategy_params: {},
        chunk_size: null,
        chunk_overlap: null,
        embedder_strategy: '',
        embedder_strategy_params: {}
      })
      setIsEdit(false)
      setIsEditMode(false)
      setExistingFiles([])
      setFilesToDelete([])
      setPendingFiles([])
      setDialogOpen(false)
      
    } catch (e) {
      console.error(e)
      showError(e.message || 'Failed to save collection')
    } finally {
      setSaveState({ loading: false })
      setSaveBusy(false)
    }
  }

  const onDelete = async () => {
    if (!form.name) return
    
    const confirmed = await showDeleteConfirmation({
      itemName: form.name,
      itemType: 'knowledge collection',
    })
    
    if (!confirmed) return
    
    setSaveState({ loading: true })
    setSaveBusy(true)
    
    try {
      await api.deleteCollection(form.name, token)
      showSuccess('Knowledge collection deleted')
      
      // Reload configurations like ToolConfig
      await loadExistingConfigs()
      
      // Reset form and close dialog
      setForm({ 
        id: null, 
        name: '', 
        category: '', 
        chunk_strategy: '', 
        chunk_strategy_params: {},
        chunk_size: null,
        chunk_overlap: null,
        embedder_strategy: '',
        embedder_strategy_params: {}
      })
      setIsEdit(false)
      setIsEditMode(false)
      setExistingFiles([])
      setFilesToDelete([])
      setPendingFiles([])
      setDialogOpen(false)
      
    } catch (e) {
      console.error(e)
      showError(e.message || 'Failed to delete collection')
    } finally {
      setSaveState({ loading: false })
      setSaveBusy(false)
    }
  }

  const chunkIntro = form.chunk_strategy ? introspection[form.chunk_strategy] : null
  const embedderIntro = form.embedder_strategy ? introspection[form.embedder_strategy] : null

  console.log('[KnowledgeConfig] Render - loading:', loading, 'existingConfigs:', existingConfigs.length, 'components:', components)

  if (loading || loadingConfigs) {
    console.log('[KnowledgeConfig] Showing loading spinner')
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 1 }}>Loading…</Typography>
      </Paper>
    )
  }

  console.log('[KnowledgeConfig] Rendering main component')

  const openCreate = () => {
    setForm({ 
      id: null, 
      name: '', 
      category: '', 
      chunk_strategy: '', 
      chunk_strategy_params: {},
      chunk_size: null,
      chunk_overlap: null,
      embedder_strategy: '',
      embedder_strategy_params: {}
    })
    setIsEdit(false)
    setIsEditMode(false)
    setExistingFiles([])
    setFilesToDelete([])
    setPendingFiles([])
    setDialogOpen(true)
  }

  const openEdit = (name) => {
    loadExistingConfig(name)
    setDialogOpen(true)
  }

  try {
    return (
    <Box>
      {(saveBusy || saveState.loading || loadingConfigs) && (
        <Fade in timeout={400}>
          <LinearProgress sx={{ mb: 2 }} />
        </Fade>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Knowledge Collections
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage knowledge collections for file upload and vector indexing.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>Create Collection</Button>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">All Collections ({existingConfigs.length})</Typography>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Embedder Strategy</TableCell>
                  <TableCell>Chunk Strategy</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {existingConfigs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No collections found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  existingConfigs.map((cfg) => (
                    <TableRow key={cfg.id || cfg.name} hover>
                      <TableCell>{cfg.name}</TableCell>
                      <TableCell>{cfg.category || '-'}</TableCell>
                      <TableCell>{cfg.embedder_strategy || '-'}</TableCell>
                      <TableCell>{cfg.chunk_strategy || '-'}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="primary" onClick={() => openEdit(cfg.name)}>
                          <EditIcon size={16} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isEdit ? 'Edit Collection' : 'Create Collection'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {existingConfigs.length > 0 && 'Start typing to search existing collections or enter a new name.'}
            </Typography>

            <Autocomplete
              freeSolo fullWidth
              options={existingConfigs.map(c => c.name)}
              value={form.name}
              loading={loadingConfigs}
              loadingText="Loading collections…"
              onChange={(_, v) => {
                if (v && existingConfigs.some(c => c.name === v)) {
                  loadExistingConfig(v)
                } else {
                  setForm(f => ({ ...f, id: null, name: v || '' }))
                  setIsEditMode(false)
                  setIsEdit(false)
                }
              }}
              onInputChange={(_, v) => {
                setForm(f => ({ ...f, name: v }))
                if (existingConfigs.some(c => c.name === v)) {
                  loadExistingConfig(v)
                } else {
                  setForm(f => ({ ...f, id: null }))
                  setIsEditMode(false)
                  setIsEdit(false)
                }
              }}
              renderInput={(params) => (
                <TextField {...params} label="Collection Name" placeholder="Enter or select a collection…" size="small" required />
              )}
            />

            <Autocomplete
              freeSolo
              fullWidth
              size="small"
              options={categories}
              value={form.category}
              loading={loadingCategories}
              disabled={saveState.loading}
              onChange={(e, val) => {
                setForm(f => ({ ...f, category: val || '' }))
                if (val && !categories.includes(val)) setCategories(prev => [...prev, val])
              }}
              onInputChange={(e, val) => {
                setForm(f => ({ ...f, category: val || '' }))
                if (val && !categories.includes(val)) setCategories(prev => [...prev, val])
              }}
              renderInput={(params) => (
                <TextField {...params} label="Category" placeholder="Enter or select a category..." size="small" />
              )}
            />

            <Paper variant="soft" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>File Upload</Typography>
              
              {console.log('[KnowledgeConfig] Render files - existingFiles.length:', existingFiles.length, 'existingFiles:', existingFiles)}
              
              {/* Existing Files */}
              {existingFiles.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>
                    Existing Files ({existingFiles.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {existingFiles.filter(filename => !filesToDelete.includes(filename)).map((filename, i) => (
                      <Chip 
                        key={`existing-${i}`} 
                        label={filename}
                        color="primary"
                        variant="outlined"
                        onDelete={() => setFilesToDelete(prev => [...prev, filename])}
                        deleteIcon={<DeleteIcon size={16} />}
                      />
                    ))}
                  </Box>
                  {filesToDelete.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, color: 'error.main' }}>
                        Files to Delete ({filesToDelete.length})
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {filesToDelete.map((filename, i) => (
                          <Chip 
                            key={`delete-${i}`} 
                            label={filename}
                            color="error"
                            variant="outlined"
                            onDelete={() => setFilesToDelete(prev => prev.filter(f => f !== filename))}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
              
              {/* File Upload */}
              <Box sx={{ border: '2px dashed', borderColor: 'grey.300', borderRadius: 2, p: 2, textAlign: 'center', mb: 2 }}>
                <input type="file" multiple style={{ display: 'none' }} id="kc-file-upload"
                  onChange={(e) => setPendingFiles(Array.from(e.target.files || []))}
                  accept=".pdf,.docx,.txt,.py,.js" />
                <label htmlFor="kc-file-upload">
                  <Button component="span" variant="contained" size="large" disabled={saveBusy}>
                    {pendingFiles.length > 0 ? `${pendingFiles.length} file(s) selected` : 'Select Files'}
                  </Button>
                </label>
              </Box>
              
              {/* Pending Files */}
              {pendingFiles.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, color: 'secondary.main' }}>
                    Files to Upload ({pendingFiles.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {pendingFiles.map((f, i) => (
                      <Chip 
                        key={`pending-${i}`} 
                        label={`${f.name} (${(f.size/1024).toFixed(1)} KB)`} 
                        color="secondary"
                        variant="outlined"
                        onDelete={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} 
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>

            {/* Embedder Strategy - Required when files are present */}
            {(existingFiles.length > 0 || pendingFiles.length > 0) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Embedder Strategy *
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Select an embedder strategy for vector indexing of your documents.
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel id="embedder-strategy-label">Embedder Strategy</InputLabel>
                    <Select 
                      labelId="embedder-strategy-label" 
                      label="Embedder Strategy" 
                      value={form.embedder_strategy || ''}
                      error={!form.embedder_strategy && (existingFiles.length > 0 || pendingFiles.length > 0)}
                      onChange={(e) => setForm(f => ({ ...f, embedder_strategy: e.target.value, embedder_strategy_params: {} }))}
                    >
                      <MenuItem value="">
                        <em>Select an embedder...</em>
                      </MenuItem>
                      {Array.isArray(components.embedders) ? components.embedders.map(c => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      )) : []}
                    </Select>
                  </FormControl>
                  <Button variant="outlined" size="small" onClick={async () => {
                    const comps = await api.discoverEmbedders(token)
                    const embedderData = comps.components?.['ai.embeddings'] || {}
                    const embedders = embedderData['ai.embeddings'] || embedderData['embeddings'] || []
                    setComponents(prev => ({ ...prev, embedders: Array.isArray(embedders) ? embedders : [] }))
                  }}>Refresh</Button>
                </Box>

                {!embedderIntro && form.embedder_strategy && (
                  <Fade in>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching embedder parameters…</Typography>
                    </Box>
                  </Fade>
                )}

                {embedderIntro && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Embedder Parameters ({embedderIntro.class_name || form.embedder_strategy.split('.').pop()})
                    </Typography>
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 2
                    }}>
                      {(embedderIntro.formatted_params || []).map((paramFormatted, idx) => {
                        const paramName = paramFormatted.split(':')[0].trim();
                        const typeMatch = paramFormatted.match(/:\s*([^=\s]+)/);
                        const paramType = typeMatch ? typeMatch[1].toLowerCase() : 'str';
                        let defaultRaw = '';
                        const descSplitIdx = paramFormatted.indexOf(' - ');
                        const mainPart = descSplitIdx !== -1 ? paramFormatted.slice(0, descSplitIdx) : paramFormatted;
                        const eqIdx = mainPart.indexOf('=');
                        if (eqIdx !== -1) {
                          defaultRaw = mainPart.slice(eqIdx + 1).trim();
                          if ((defaultRaw.startsWith("'") && defaultRaw.endsWith("'")) || (defaultRaw.startsWith('"') && defaultRaw.endsWith('"'))) {
                            defaultRaw = defaultRaw.slice(1, -1);
                          }
                        }
                        const hasDefault = defaultRaw !== '' && defaultRaw.toLowerCase() !== 'none';
                        const placeholderText = hasDefault ? `Default: ${defaultRaw}` : `Enter ${paramName}`;
                        let gridColumn = 'span 1';
                        if (paramType.includes('int') || paramType.includes('float') || paramType.includes('bool')) {
                          gridColumn = 'span 1';
                        } else if (paramType.includes('str') && (paramName.includes('key') || paramName.includes('token') || paramName.includes('url'))) {
                          gridColumn = 'span 2';
                        }
                        return (
                          <TextField
                            key={paramName}
                            size="small"
                            label={paramName}
                            InputLabelProps={{ shrink: true }}
                            value={form.embedder_strategy_params[paramName] || ''}
                            onChange={(e) => setForm(f => ({
                              ...f,
                              embedder_strategy_params: { ...(f.embedder_strategy_params || {}), [paramName]: e.target.value }
                            }))}
                            placeholder={placeholderText}
                            sx={{ gridColumn }}
                            type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced Configuration</AccordionSummary>
              <AccordionDetails>
                {/* Chunking Configuration - only show when embedder is selected and files are present */}
                {form.embedder_strategy && (existingFiles.length > 0 || pendingFiles.length > 0) ? (
                  <>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                      <FormControl size="small" sx={{ minWidth: 220 }}>
                        <InputLabel id="chunk-strategy-label">
                          Chunk Strategy (Optional)
                        </InputLabel>
                        <Select 
                          labelId="chunk-strategy-label" 
                          label="Chunk Strategy (Optional)"
                          value={form.chunk_strategy || ''}
                          onChange={(e) => setForm(f => ({ ...f, chunk_strategy: e.target.value, chunk_strategy_params: {} }))}>
                          <MenuItem value="">
                            <em>Select chunking strategy...</em>
                          </MenuItem>
                          {Array.isArray(components.chunking) ? components.chunking.map(c => (
                            <MenuItem key={c} value={c}>{c}</MenuItem>
                          )) : []}
                        </Select>
                      </FormControl>
                      <Button variant="outlined" size="small" onClick={async () => {
                        const comps = await api.discoverChunking(token)
                        const chunkingData = comps.components?.['ai.chunking'] || {}
                        const chunking = chunkingData['ai.chunking'] || chunkingData['chunking'] || []
                        setComponents(prev => ({ ...prev, chunking: Array.isArray(chunking) ? chunking : [] }))
                      }}>Refresh</Button>
                    </Box>

                    {!form.chunk_strategy && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                        No chunking strategy selected. Default chunking will be applied by the backend.
                      </Typography>
                    )}

                    {!chunkIntro && form.chunk_strategy && (
                      <Fade in>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <CircularProgress size={16} />
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching chunking parameters…</Typography>
                        </Box>
                      </Fade>
                    )}

                    {chunkIntro && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Chunking Parameters ({chunkIntro.class_name || form.chunk_strategy.split('.').pop()})
                        </Typography>
                        {console.log('[KnowledgeConfig] chunkIntro:', chunkIntro)}
                        {console.log('[KnowledgeConfig] formatted_params:', chunkIntro.formatted_params)}
                        <Box sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: 2
                        }}>
                          {(chunkIntro.formatted_params || []).map((paramFormatted, idx) => {
                            console.log('[KnowledgeConfig] Processing param:', paramFormatted)
                            const paramName = paramFormatted.split(':')[0].trim();
                            const typeMatch = paramFormatted.match(/:\s*([^=\s]+)/);
                            const paramType = typeMatch ? typeMatch[1].toLowerCase() : 'str';
                            let defaultRaw = '';
                            const descSplitIdx = paramFormatted.indexOf(' - ');
                            const mainPart = descSplitIdx !== -1 ? paramFormatted.slice(0, descSplitIdx) : paramFormatted;
                            const eqIdx = mainPart.indexOf('=');
                            if (eqIdx !== -1) {
                              defaultRaw = mainPart.slice(eqIdx + 1).trim();
                              if ((defaultRaw.startsWith("'") && defaultRaw.endsWith("'")) || (defaultRaw.startsWith('"') && defaultRaw.endsWith('"'))) {
                                defaultRaw = defaultRaw.slice(1, -1);
                              }
                            }
                            const hasDefault = defaultRaw !== '' && defaultRaw.toLowerCase() !== 'none';
                            const placeholderText = hasDefault ? `Default: ${defaultRaw}` : `Enter ${paramName}`;
                            let gridColumn = 'span 1';
                            if (paramType.includes('int') || paramType.includes('float') || paramType.includes('bool')) {
                              gridColumn = 'span 1';
                            } else if (paramType.includes('str') && (paramName.includes('key') || paramName.includes('token') || paramName.includes('url'))) {
                              gridColumn = 'span 2';
                            }
                            return (
                              <TextField
                                key={paramName}
                                size="small"
                                label={paramName}
                                InputLabelProps={{ shrink: true }}
                                value={form.chunk_strategy_params[paramName] || ''}
                                onChange={(e) => setForm(f => ({
                                  ...f,
                                  chunk_strategy_params: { ...(f.chunk_strategy_params || {}), [paramName]: e.target.value }
                                }))}
                                placeholder={placeholderText}
                                sx={{ gridColumn }}
                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    )}

                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Basic Configuration (Optional)</Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <TextField 
                          size="small" 
                          label="Chunk Size (Optional)" 
                          type="number"
                          value={form.chunk_size || ''}
                          onChange={(e) => setForm(f => ({ ...f, chunk_size: e.target.value ? parseInt(e.target.value) : null }))}
                          placeholder={`Default: ${defaults.chunk_size || 5000}`}
                          sx={{ width: 160 }} 
                        />
                        <TextField 
                          size="small" 
                          label="Chunk Overlap (Optional)" 
                          type="number"
                          value={form.chunk_overlap || ''}
                          onChange={(e) => setForm(f => ({ ...f, chunk_overlap: e.target.value ? parseInt(e.target.value) : null }))}
                          placeholder={`Default: ${defaults.chunk_overlap || 0}`}
                          sx={{ width: 170 }} 
                        />
                      </Box>
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    {!(existingFiles.length > 0 || pendingFiles.length > 0) 
                      ? 'Upload files to configure chunking options.'
                      : !form.embedder_strategy 
                        ? 'Select an embedder strategy to configure chunking options.'
                        : 'Configure chunking options for your documents.'
                    }
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          {isEdit && (
            <Button color="error" onClick={onDelete} startIcon={<DeleteIcon size={16} />} disabled={saveState.loading}>Delete</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDialogOpen(false)} disabled={saveState.loading}>Cancel</Button>
          <Button onClick={save} variant="contained" disabled={saveState.loading || !form.name}>
            {saveState.loading ? (isEdit ? 'Updating…' : 'Saving…') : (isEdit ? 'Update Collection' : 'Create Collection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
  } catch (error) {
    console.error('[KnowledgeConfig] Render error:', error)
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Error rendering Knowledge Config: {error.message}</Typography>
      </Box>
    )
  }
}
