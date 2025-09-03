import React, { useEffect, useMemo, useState } from 'react'
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

function useAuthToken() {
  const token = useMemo(() => localStorage.getItem('token'), [])
  return token
}

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
  async uploadFiles(collection, files, token) {
    const fd = new FormData()
    fd.append('collection', collection)
    for (const f of files) fd.append('files', f)
    const r = await apiCall(`/api/knowledge/upload?collection=${encodeURIComponent(collection)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
  async discoverChunking(token) {
    const r = await apiCall('/api/knowledge/components?folder=ai.document.chunking', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return r.json()
  },
  async introspect(module_path, token) {
    const r = await apiCall('/api/knowledge/introspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ module_path, kind: 'chunk' })
    })
    return r.json()
  }
}

export default function KnowledgeConfig() {
  const theme = useTheme()
  const token = useAuthToken()

  const [loading, setLoading] = useState(true)
  const [collections, setCollections] = useState([])
  const [categories, setCategories] = useState([])
  const [components, setComponents] = useState({ chunking: [] })
  const [introspection, setIntrospection] = useState({})
  const [defaults, setDefaults] = useState({ chunk_size: 5000, chunk_overlap: 0 })
  const [isEdit, setIsEdit] = useState(false)

  const [form, setForm] = useState({
    name: '',
    category: '',
    chunk_strategy: '',
    chunk_strategy_params: {},
    chunk_size: 5000,
    chunk_overlap: 0
  })

  const [pendingFiles, setPendingFiles] = useState([])
  const [saveBusy, setSaveBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    // Boot: defaults, categories, collections, chunking discovery
    Promise.all([
      api.getDefaults(token),
      api.getCategories(token),
      api.getCollections(token),
      api.discoverChunking(token)
    ]).then(([d, c, p, comps]) => {
      setDefaults(d.defaults || {})
      setCategories(c.categories || [])
      setCollections(p.collections || [])
      const chunking = comps.components?.['ai.document.chunking'] || []
      setComponents({ chunking })
    }).catch(err => console.error(err)).finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (form.chunk_strategy && !introspection[form.chunk_strategy]) {
      api.introspect(form.chunk_strategy, token).then(info => {
        setIntrospection(prev => ({ ...prev, [form.chunk_strategy]: info }))
      }).catch(() => {})
    }
  }, [form.chunk_strategy, token])

  const loadExisting = async (name) => {
    setLoading(true)
    try {
      const data = await api.getCollection(name, token)
      setForm({
        name: data.collection,
        category: data.category || '',
        chunk_strategy: data.chunk?.strategy || '',
        chunk_strategy_params: data.chunk?.params || {},
        chunk_size: data.chunk?.chunk_size ?? defaults.chunk_size ?? 5000,
        chunk_overlap: data.chunk?.chunk_overlap ?? defaults.chunk_overlap ?? 0
      })
      setIsEdit(true)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!form.name) return
    setSaveBusy(true)
    try {
      const payload = {
        collection: form.name,
        category: form.category || '',
        overwrite: isEdit,
        chunk: form.chunk_strategy ? {
          strategy: form.chunk_strategy,
          params: form.chunk_strategy_params || {},
          chunk_size: form.chunk_size || defaults.chunk_size || 5000,
          chunk_overlap: form.chunk_overlap || defaults.chunk_overlap || 0
        } : {
          chunk_size: form.chunk_size || defaults.chunk_size || 5000,
          chunk_overlap: form.chunk_overlap || defaults.chunk_overlap || 0
        }
      }
      const res = await api.saveCollection(payload, token)
      if (pendingFiles.length > 0) {
        await api.uploadFiles(form.name, pendingFiles, token)
        setPendingFiles([])
      }
      if (res.exists) {
        // Save again forcing overwrite
        await api.saveCollection({ ...payload, overwrite: true }, token)
      }
      // refresh lists
      const collections = await api.getCollections(token)
      setCollections(collections.collections || [])
      const cat = await api.getCategories(token)
      setCategories(cat.categories || [])
      setIsEdit(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSaveBusy(false)
    }
  }

  const onDelete = async () => {
    if (!form.name) return
    setSaveBusy(true)
    try {
      await api.deleteCollection(form.name, token)
      setForm({ name: '', category: '', chunk_strategy: '', chunk_strategy_params: {}, chunk_size: defaults.chunk_size || 5000, chunk_overlap: defaults.chunk_overlap || 0 })
      setIsEdit(false)
      const collections = await api.getCollections(token)
      setCollections(collections.collections || [])
  setDialogOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaveBusy(false)
    }
  }

  const chunkIntro = form.chunk_strategy ? introspection[form.chunk_strategy] : null

  if (loading) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 1 }}>Loading…</Typography>
      </Paper>
    )
  }

  const openCreate = () => {
    setForm({ name: '', category: '', chunk_strategy: '', chunk_strategy_params: {}, chunk_size: defaults.chunk_size || 5000, chunk_overlap: defaults.chunk_overlap || 0 })
    setIsEdit(false)
    setPendingFiles([])
    setDialogOpen(true)
  }

  const openEdit = (name) => {
    loadExisting(name).then(() => setDialogOpen(true))
  }

  return (
    <Box>
      {(saveBusy) && (
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
            <Typography variant="h6">All Collections ({collections.length})</Typography>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Chunk Strategy</TableCell>
                  <TableCell>Chunk Size</TableCell>
                  <TableCell>Overlap</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {collections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No collections found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  collections.map((p) => (
                    <TableRow key={p} hover>
                      <TableCell>{p}</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="primary" onClick={() => openEdit(p)}>
                          <EditIcon size={16} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => { setForm(f => ({ ...f, name: p })); setIsEdit(true); onDelete(); }}>
                          <DeleteIcon size={16} />
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Autocomplete
              freeSolo fullWidth
              options={collections}
              value={form.name}
              onChange={(_, v) => {
                if (v && collections.includes(v)) loadExisting(v)
                else { setForm(f => ({ ...f, name: v || '' })); setIsEdit(false) }
              }}
              onInputChange={(_, v) => {
                setForm(f => ({ ...f, name: v || '' }))
              }}
              renderInput={(params) => (
                <TextField {...params} label="Collection Name" placeholder="Enter or select a collection…" size="small" required />
              )}
            />

            <Autocomplete
              freeSolo fullWidth size="small"
              options={categories}
              value={form.category}
              onChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
              onInputChange={(_, v) => setForm(f => ({ ...f, category: v || '' }))}
              renderInput={(params) => (
                <TextField {...params} label="Category" placeholder="Enter or select a category…" />
              )}
            />

            <Paper variant="soft" sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>File Upload</Typography>
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
              {pendingFiles.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {pendingFiles.map((f, i) => (
                    <Chip key={i} label={`${f.name} (${(f.size/1024).toFixed(1)} KB)`} onDelete={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} />
                  ))}
                </Box>
              )}
            </Paper>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced Configuration</AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel id="chunk-strategy-label">Chunk Strategy</InputLabel>
                    <Select labelId="chunk-strategy-label" label="Chunk Strategy" value={form.chunk_strategy || ''}
                      onChange={(e) => setForm(f => ({ ...f, chunk_strategy: e.target.value, chunk_strategy_params: {} }))}>
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {(components.chunking || []).map(c => (
                        <MenuItem key={c} value={c}>{c}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button variant="outlined" size="small" onClick={async () => {
                    const comps = await api.discoverChunking(token)
                    const chunking = comps.components?.['ai.document.chunking'] || []
                    setComponents({ chunking })
                  }}>Refresh</Button>
                </Box>

                {!form.chunk_strategy && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                    Select a chunking strategy to configure additional parameters.
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {(chunkIntro.formatted_params || []).map((p, idx) => (
                        <TextField key={idx} size="small" label={p.split(':')[0]} placeholder={p} onChange={(e) => {
                          const key = p.split(':')[0]
                          setForm(f => ({ ...f, chunk_strategy_params: { ...(f.chunk_strategy_params || {}), [key]: e.target.value } }))
                        }} />
                      ))}
                    </Box>
                  </Box>
                )}

                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Basic Configuration</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField size="small" label="Chunk Size" type="number"
                      value={form.chunk_size || defaults.chunk_size || 5000}
                      onChange={(e) => setForm(f => ({ ...f, chunk_size: parseInt(e.target.value) || defaults.chunk_size || 5000 }))}
                      sx={{ width: 140 }} />
                    <TextField size="small" label="Chunk Overlap" type="number"
                      value={form.chunk_overlap || defaults.chunk_overlap || 0}
                      onChange={(e) => setForm(f => ({ ...f, chunk_overlap: parseInt(e.target.value) || defaults.chunk_overlap || 0 }))}
                      sx={{ width: 140 }} />
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        </DialogContent>
        <DialogActions>
          {isEdit && (
            <Button color="error" onClick={onDelete} startIcon={<DeleteIcon size={16} />} disabled={saveBusy}>Delete</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDialogOpen(false)} disabled={saveBusy}>Cancel</Button>
          <Button size="large" variant="contained" disabled={!form.name || saveBusy} onClick={save}>
            {saveBusy ? (isEdit ? 'Updating…' : 'Saving…') : (isEdit ? 'Update Collection' : 'Create Collection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
