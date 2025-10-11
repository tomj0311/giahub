import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import sharedApiService from '../utils/apiService'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'

export default function KnowledgeConfig({ user }) {
  const theme = useTheme()
  const token = user?.token
  const { showSuccess, showError, showWarning } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  // Add ref to track if component is mounted and prevent duplicate calls
  const isMountedRef = useRef(true)
  const isLoadingConfigsRef = useRef(false)
  const isLoadingCategoriesRef = useRef(false)
  const isLoadingModelsRef = useRef(false)

  // Store token ref to avoid useCallback dependency issues
  const tokenRef = useRef(token)
  tokenRef.current = token

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

  // Form validation errors
  const [errors, setErrors] = useState({
    name: ''
  })

  const loadModels = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate calls
    if (isLoadingModelsRef.current) {
      return;
    }
    
    try {
      isLoadingModelsRef.current = true;
  // removed loading models log
      
      const result = await sharedApiService.makeRequest(
        '/api/models/configs',
        {
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { token: tokenRef.current?.substring(0, 10) }
      );
      
  // removed models api response log
      
      if (!isMountedRef.current) {
        return;
      }
      
      if (result.success) {
        // The response structure is { configurations: [...] } from ModelConfig
        const modelsList = result.data.configurations || []
  // removed processed models list log
        setModels(Array.isArray(modelsList) ? modelsList : [])
      } else {
        console.error('[KnowledgeConfig] Failed to load models:', result.error)
        if (isMountedRef.current) {
          showError('Failed to load models')
        }
      }
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load models:', error)
      if (isMountedRef.current) {
        showError('Failed to load models')
      }
    } finally {
      if (isMountedRef.current) {
        isLoadingModelsRef.current = false;
      }
    }
  }, []); // Empty dependencies

  const loadCategories = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate calls
    if (isLoadingCategoriesRef.current) {
      return;
    }
    
    try {
      isLoadingCategoriesRef.current = true;
      setLoadingCategories(true)
      
      const result = await sharedApiService.makeRequest(
        '/api/knowledge/categories',
        {
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { token: tokenRef.current?.substring(0, 10) }
      );
      
      if (!isMountedRef.current) {
        return;
      }
      
      if (result.success) {
        setCategories(result.data.categories || [])
      } else {
        console.error('[KnowledgeConfig] Failed to load categories:', result.error)
      }
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load categories:', error)
    } finally {
      if (isMountedRef.current) {
        isLoadingCategoriesRef.current = false;
        setLoadingCategories(false)
      }
    }
  }, []); // Empty dependencies

  const loadExistingConfigs = useCallback(async (page = 1, pageSize = 8) => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate calls
    if (isLoadingConfigsRef.current) {
      return;
    }
    
    try {
      isLoadingConfigsRef.current = true;
      setLoadingConfigs(true)
      
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: 'collection',
        sort_order: 'asc'
      });
      
      const result = await sharedApiService.makeRequest(
        `/api/knowledge/collections?${queryParams}`,
        {
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { 
          page, 
          pageSize, 
          token: tokenRef.current?.substring(0, 10) 
        }
      );
      
      if (!isMountedRef.current) {
        return;
      }
      
      if (result.success) {
        const data = result.data;
        const collections = data.collections || [];
        
  // removed raw api response logs
        
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
  // removed collections loaded log
      } else {
        console.error('[KnowledgeConfig] Failed to load collections:', result.error)
      }
    } catch (error) {
      console.error('[KnowledgeConfig] Failed to load collections:', error)
    } finally {
      if (isMountedRef.current) {
        isLoadingConfigsRef.current = false;
        setLoadingConfigs(false)
      }
    }
  }, []); // Empty dependencies

  const handlePageChange = (event, newPage) => {
    if (!loadingConfigs && !saveState.loading) {
      const actualPage = newPage + 1; // Convert from 0-based to 1-based
      loadExistingConfigs(actualPage, pagination.rowsPerPage);
    }
  };

  const handleRowsPerPageChange = (event) => {
    if (!loadingConfigs && !saveState.loading) {
      const newPageSize = parseInt(event.target.value, 10);
      setPagination(prev => ({ ...prev, page: 0, rowsPerPage: newPageSize })); // Reset to first page
      loadExistingConfigs(1, newPageSize);
    }
  };

  useEffect(() => {
    // Load data like ToolConfig does
    const loadData = async () => {
  // removed mount log
      if (!isMountedRef.current) return;
      
      try {
        setLoading(true)
        
        // Load data using singleton service
        await Promise.all([
          loadModels(),
          loadCategories(),
          loadExistingConfigs()
        ]);
        
        if (isMountedRef.current) {
          setLoading(false)
        }
      } catch (error) {
        console.error('[KnowledgeConfig] Failed to load initial data:', error)
        if (isMountedRef.current) {
          setLoading(false)
        }
      }
    }
    
    loadData()
  }, []); // Empty dependencies to prevent duplicate calls

  // Cleanup function to handle component unmount
  useEffect(() => {
    return () => {
  // removed unmount log
      isMountedRef.current = false;
    };
  }, []);

  const validateForm = () => {
    const newErrors = {
      name: ''
    }

    // Validate name
    if (!form.name || form.name.trim() === '') {
      newErrors.name = 'Collection name is required'
    }

    setErrors(newErrors)
    return !newErrors.name
  }

  const resetErrors = () => {
    setErrors({
      name: ''
    })
  }

  async function loadExistingConfig(configName) {
    const config = existingConfigs.find(c => c.name === configName)
    if (config) {
  // removed loading config log
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
        const result = await sharedApiService.makeRequest(
          `/api/knowledge/collection/${encodeURIComponent(configName)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          { collection: configName, token: token?.substring(0, 10) }
        );
        
        if (result.success) {
          const files = result.data.files || [];
          // removed setting existing files log
          setExistingFiles(files)
        } else {
          console.error('[KnowledgeConfig] Failed to load collection files:', result.error)
          setExistingFiles([])
        }
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
    // Validate form before saving
    if (!validateForm()) {
      return
    }
    
    setSaveState(s => ({ ...s, loading: true }))
    setSaveBusy(true)
    
    try {
      // Delete files marked for deletion first
      if (filesToDelete.length > 0) {
        for (const filename of filesToDelete) {
          try {
            const result = await sharedApiService.makeRequest(
              `/api/knowledge/collection/${encodeURIComponent(form.name)}/file/${encodeURIComponent(filename)}`,
              {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
              },
              { collection: form.name, filename, token: token?.substring(0, 10) }
            );
            
            if (!result.success) {
              throw new Error(result.error || 'Failed to delete file');
            }
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
      
      const result = await sharedApiService.makeRequest(
        '/api/knowledge/collection/save',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        },
        { collection: form.name, token: token?.substring(0, 10) }
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save collection');
      }
      
      const res = result.data;
      
      if (pendingFiles.length > 0) {
        const fd = new FormData()
        fd.append('collection', form.name)
        for (const f of pendingFiles) fd.append('files', f)
        if (payload) {
          fd.append('payload', JSON.stringify(payload))
        }
        
        const uploadResult = await sharedApiService.makeRequest(
          `/api/knowledge/upload?collection=${encodeURIComponent(form.name)}`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd
          },
          { collection: form.name, upload: true, token: token?.substring(0, 10) }
        );
        
        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Upload failed');
        }
        
        setPendingFiles([])
      }
      
      if (res.exists) {
        // Save again forcing overwrite
        const overwriteResult = await sharedApiService.makeRequest(
          '/api/knowledge/collection/save',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ ...payload, overwrite: true })
          },
          { collection: form.name, overwrite: true, token: token?.substring(0, 10) }
        );
        
        if (!overwriteResult.success) {
          throw new Error(overwriteResult.error || 'Failed to overwrite collection');
        }
      }
      
      const action = isEdit ? 'updated' : 'saved'
      showSuccess(`Knowledge collection "${form.name}" ${action} successfully`)
      
      // Invalidate cache and reload data like ToolConfig
      sharedApiService.invalidateCache();
      if (isMountedRef.current) {
        await Promise.all([
          loadExistingConfigs(),
          loadCategories()
        ])
      }
      
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
      const result = await sharedApiService.makeRequest(
        `/api/knowledge/collection/${encodeURIComponent(form.name)}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        },
        { collection: form.name, delete: true, token: token?.substring(0, 10) }
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }
      
      showSuccess('Knowledge collection deleted')
      
      // Invalidate cache and reload configurations like ToolConfig
      sharedApiService.invalidateCache();
      if (isMountedRef.current) {
        await loadExistingConfigs()
      }
      
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

  // removed render debug log

  if (loading || loadingConfigs) {
  // removed loading spinner log
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 1 }}>Loading…</Typography>
      </Paper>
    )
  }

  // removed rendering main component log

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
    resetErrors()
    setDialogOpen(true)
  }

  const openEdit = (name) => {
    loadExistingConfig(name)
    resetErrors()
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

      <Dialog 
        open={dialogOpen} 
        onClose={() => {
          setDialogOpen(false);
          resetErrors();
        }} 
        maxWidth="md" 
        fullWidth
      >
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
                // Clear error when user changes the field
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: '' }));
                }
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
                // Clear error when user types
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: '' }));
                }
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
                  error={!!errors.name}
                  helperText={errors.name || (isEdit ? 'Name locked while editing existing collection' : '')}
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
              
              {/* removed inline render debug log */}
              
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
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    setPendingFiles(prev => [...prev, ...newFiles]);
                    // Reset the input value to allow selecting the same files again if needed
                    e.target.value = '';
                  }}
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
                  {/* removed models dropdown debug log */}
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
          <Button 
            onClick={() => {
              setDialogOpen(false);
              resetErrors();
            }} 
            disabled={saveState.loading}
          >
            Cancel
          </Button>
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
