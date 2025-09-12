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
  Stack,
  TablePagination
} from '@mui/material'
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
  async getModels(token) {
    const r = await apiCall('/api/models/configs', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return r.json()
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
  const [pagination, setPagination] = useState({
    page: 0, // MUI uses 0-based pagination
    rowsPerPage: 8,
    total: 0,
    totalPages: 0
  })
  const [models, setModels] = useState([])
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [defaults, setDefaults] = useState({ chunk_size: 5000, chunk_overlap: 0 })
  const [isEdit, setIsEdit] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)

  const [form, setForm] = useState({
    id: null,
    name: '',
    category: '',
    model_id: ''
  })

  const [pendingFiles, setPendingFiles] = useState([])
  const [existingFiles, setExistingFiles] = useState([]) // Files already in the collection
  const [filesToDelete, setFilesToDelete] = useState([]) // Files marked for deletion
  const [saveBusy, setSaveBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saveState, setSaveState] = useState({ loading: false })

  const loadModels = async () => {
    try {
      console.log('[KnowledgeConfig] Loading models...')
      const response = await api.getModels(token)
      console.log('[KnowledgeConfig] Models API response:', response)
      
      // The response structure is { configurations: [...] } from ModelConfig
      const modelsList = response.configurations || []
      console.log('[KnowledgeConfig] Processed models list:', modelsList)
      setModels(Array.isArray(modelsList) ? modelsList : [])
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load models:', error)
      showError('Failed to load models')
    }
  }

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

  const loadExistingConfigs = async (page = 1, pageSize = 8) => {
    try {
      setLoadingConfigs(true)
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: 'collection',
        sort_order: 'asc'
      });
      
      const collectionsResponse = await apiCall(`/api/knowledge/collections?${queryParams}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      if (collectionsResponse.ok) {
        const data = await collectionsResponse.json();
        const collections = data.collections || [];
        
        console.log('[KnowledgeConfig] Raw API response:', data);
        console.log('[KnowledgeConfig] Collections from API:', collections);
        
        // Set pagination data
        if (data.pagination) {
          setPagination({
            page: data.pagination.page - 1, // Convert to 0-based for MUI
            rowsPerPage: data.pagination.page_size,
            total: data.pagination.total,
            totalPages: data.pagination.total_pages
          });
        }
        
        // Load full data for each collection like ToolConfig loads configurations
        const collectionsWithData = []
        for (const collection of collections) {
          try {
            // For paginated results, collections already have the needed structure
            // from the backend's list_collections_paginated method
            collectionsWithData.push({
              id: collection.id || collection.name,
              name: collection.name,
              category: collection.category || '',
              model_id: collection.model_id || '',
              model_name: collection.model_name || '',
              files_count: collection.files_count || 0,
              files: [] // Will be loaded when editing
            })
          } catch (error) {
            console.error(`[KnowledgeConfig] Failed to process collection ${collection.name}:`, error)
            // Add basic entry if collection data can't be processed
            collectionsWithData.push({
              id: collection.name,
              name: collection.name,
              category: '',
              model_id: '',
              model_name: '',
              files_count: 0,
              files: []
            })
          }
        }
        setExistingConfigs(collectionsWithData)
        console.log('[KnowledgeConfig] Collections loaded:', collectionsWithData)
      } else {
        console.error('[KnowledgeConfig] Failed to load collections - bad response')
      }
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load collections:', error)
    } finally {
      setLoadingConfigs(false)
    }
  }

  const handlePageChange = (event, newPage) => {
    const actualPage = newPage + 1; // Convert from 0-based to 1-based
    loadExistingConfigs(actualPage, pagination.rowsPerPage);
  };

  const handleRowsPerPageChange = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    setPagination(prev => ({ ...prev, page: 0, rowsPerPage: newPageSize })); // Reset to first page
    loadExistingConfigs(1, newPageSize);
  };

  useEffect(() => {
    // Load data like ToolConfig does
    const loadData = async () => {
      console.log('[KnowledgeConfig] Starting data load...')
      try {
        setLoading(true)
        
        // Load defaults and models first
        const [d] = await Promise.all([
          api.getDefaults(token)
        ])
        
        console.log('[KnowledgeConfig] API responses:', { d })
        setDefaults(d.defaults || {})
        
        // Load models separately to handle errors better
        await loadModels()
        
        // Load configs and categories
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

  async function loadExistingConfig(configName) {
    const config = existingConfigs.find(c => c.name === configName)
    if (config) {
      console.log('[KnowledgeConfig] Loading config:', config) // Keep this debug temporarily
      setForm({
        ...config,
        id: config.id,
        name: config.name,
        category: config.category || '',
        model_id: config.model_id || ''
      })
      setIsEditMode(true)
      setIsEdit(true)
      
      // Load files from the collection API when editing
      try {
        const collectionData = await api.getCollection(configName, token);
        const files = collectionData.files || [];
        console.log('[KnowledgeConfig] Setting existing files to:', files)
        setExistingFiles(files)
      } catch (error) {
        console.error('[KnowledgeConfig] Failed to load collection files:', error)
        setExistingFiles([])
      }
      setFilesToDelete([])
    } else {
      setForm({ 
        id: null, 
        name: configName, 
        category: '', 
        model_id: ''
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
        model_id: form.model_id || '',
        overwrite: isEdit
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
        model_id: ''
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
        model_id: ''
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

  const chunkIntro = null
  const embedderIntro = null

  console.log('[KnowledgeConfig] Render - loading:', loading, 'existingConfigs:', existingConfigs.length, 'models:', models)

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
      model_id: ''
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
            <Typography variant="h6">
              All Collections ({pagination.total} total, showing {existingConfigs.length})
            </Typography>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell>Files</TableCell>
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
                      <TableCell>{cfg.model_name || cfg.model_id || '-'}</TableCell>
                      <TableCell>{cfg.files_count || 0}</TableCell>
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
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page}
            onPageChange={handlePageChange}
            rowsPerPage={pagination.rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[8, 16, 24, 50]}
            showFirstButton
            showLastButton
          />
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
              disabled={isEdit} // prevent renaming while editing to keep id-based operations simple
              onChange={(_, v) => {
                // If selecting from dropdown, load immediately; otherwise just update name
                if (v && existingConfigs.some(c => c.name === v)) {
                  loadExistingConfig(v)
                } else {
                  setForm(f => ({ ...f, name: v || '' }))
                  // Keep isEdit/isEditMode so a rename updates rather than creating duplicate
                }
              }}
              onInputChange={(_, v) => {
                if (isEdit) return; // block name changes during edit mode
                // Only update the form name while typing, don't load config
                setForm(f => ({ ...f, name: v }))
              }}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="Collection Name" 
                  placeholder="Enter or select a collection…" 
                  size="small" 
                  required 
                  helperText={isEdit ? 'Name locked while editing existing collection' : ''}
                  onBlur={(e) => {
                    if (isEdit) return; // block loading during edit mode
                    // Load existing config only when user stops typing (on blur)
                    const inputValue = e.target.value;
                    if (inputValue && existingConfigs.some(c => c.name === inputValue)) {
                      loadExistingConfig(inputValue);
                    }
                  }}
                />
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

            {/* Model Selection */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Model Selection
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select a model for processing your documents.
              </Typography>
              
              <FormControl size="small" sx={{ minWidth: 300 }}>
                <InputLabel id="model-select-label">Model</InputLabel>
                <Select 
                  labelId="model-select-label" 
                  label="Model" 
                  value={form.model_id || ''}
                  onChange={(e) => setForm(f => ({ ...f, model_id: e.target.value }))}
                >
                  <MenuItem value="">
                    <em>Select a model...</em>
                  </MenuItem>
                  {console.log('[KnowledgeConfig] Rendering models in dropdown:', models)}
                  {models.map(model => (
                    <MenuItem key={model.id || model.name} value={model.id || model.name}>
                      {model.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

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
