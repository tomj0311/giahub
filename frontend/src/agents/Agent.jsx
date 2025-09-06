import React, { useEffect, useMemo, useState } from 'react'
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
  IconButton
} from '@mui/material'
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'

import { apiCall } from '../config/api'

export default function Agent({ user }) {
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

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
    // IDs instead of names
    model_id: '',
    tools: {},          // keys are tool IDs
    knowledge_collection_id: '', // single knowledge collection ID
    memory: { history: { enabled: false, num: 3 } },
  })

  const toolList = Object.keys(form.tools || {}) // IDs

  // ID -> Name maps for display
  const modelNameById = useMemo(() => Object.fromEntries(models.map(m => [m.id, m.name])), [models])
  const toolNameById = useMemo(() => Object.fromEntries(tools.map(t => [t.id, t.name])), [tools])
  const collectionNameById = useMemo(() => Object.fromEntries(knowledgeCollections.map(c => [c.id, c.name])), [knowledgeCollections])

  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      category: '',
      description: '',
      instructions: '',
      model_id: '',
      tools: {},
      knowledge_collection_id: '',
      memory: { history: { enabled: false, num: 3 } },
    })
  }

  async function fetchAll() {
    setLoading(true)
    try {
      const [modelsRes, toolsRes, modelCatsRes, collectionsRes, agentsRes] = await Promise.all([
        apiCall(`/api/model-config/configs`, { headers: authHeaders }),
        apiCall(`/api/tool-config/configs`, { headers: authHeaders }),
        apiCall(`/api/model-config/categories`, { headers: authHeaders }),
        apiCall(`/api/knowledge/collections`, { headers: authHeaders }),
        apiCall(`/api/agents`, { headers: authHeaders }),
      ])

      const modelsJson = await modelsRes.json().catch(() => ({}))
      const toolsJson = await toolsRes.json().catch(() => ({}))
      const catsJson = await modelCatsRes.json().catch(() => ({}))
      const collectionsJson = await collectionsRes.json().catch(() => ({}))
      const agentsJson = await agentsRes.json().catch(() => ({}))

  setModels((modelsJson.configurations || []).map(c => ({ id: c.id, name: c.name })).sort((a,b)=>a.name.localeCompare(b.name)))
  setTools((toolsJson.configurations || []).map(c => ({ id: c.id, name: c.name })).sort((a,b)=>a.name.localeCompare(b.name)))
      setCategories((catsJson.categories || []).sort())
  setKnowledgeCollections((collectionsJson.collections || []).map(c => ({ id: c.id, name: c.name })).sort((a,b)=>a.name.localeCompare(b.name)))
      setExistingAgents(agentsJson.agents || [])
    } catch (e) {
      console.error(e)
      showError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const loadAgent = (agent) => {
    if (!agent) return
    setForm({
      id: agent.id || null,
      name: agent.name || '',
      category: agent.category || '',
      description: agent.description || '',
      instructions: agent.instructions || '',
      model_id: agent.model?.id || '',
      tools: agent.tools || {}, // assume already keyed by ID
      knowledge_collection_id: agent.collection || agent.knowledge_collection_id || '',
      memory: agent.memory || { history: { enabled: false, num: 3 } },
    })
  }

  const handleSave = async () => {
    if (!form.name) { showError('Name is required'); return }
    if (!form.model_id) { showError('Select a model configuration'); return }
    setSaving(true)
    try {
      const payload = {
        id: form.id,
        name: form.name,
        category: form.category,
        description: form.description,
        instructions: form.instructions,
        model: form.model_id ? { id: form.model_id } : null,
        tools: form.tools,
        collection: form.knowledge_collection_id || '',
        memory: form.memory,
      }
      const resp = await apiCall(`/api/agents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Save failed (${resp.status})`)
      showSuccess(`Agent ${data.name} saved`)
  await fetchAll()
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
      setForm(f => ({ ...f, id: null, name: '' }))
      await fetchAll()
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
    setDialogOpen(true)
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
            <Typography variant="h6">All Agents ({existingAgents.length})</Typography>
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
                    const mem = a.memory?.history?.enabled
                      ? `History (${a.memory?.history?.num ?? 3})`
                      : 'Off'
                    return (
                      <TableRow key={a.id || a.name} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">{a.name}</Typography>
                          {a.description && (
                            <Typography variant="caption" color="text.secondary">{a.description}</Typography>
                          )}
                        </TableCell>
                        <TableCell>{a.category || '-'}</TableCell>
                        <TableCell>{a.model?.id ? (modelNameById[a.model.id] || a.model.id) : '-'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {toolIds.length === 0 ? (
                              <Chip size="small" label="None" />
                            ) : (
                              toolIds.slice(0, 3).map(tid => (
                                <Chip key={tid} size="small" label={toolNameById[tid] || tid} variant="outlined" />
                              ))
                            )}
                            {toolIds.length > 3 && (
                              <Chip size="small" label={`+${toolIds.length - 3}`} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{(a.collection && (collectionNameById[a.collection] || a.collection)) || '-'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={mem} color={a.memory?.history?.enabled ? 'primary' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="primary" onClick={() => openEdit(a)}>
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
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
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
                    setForm(f => ({ ...f, name: v || '' }))
                    if (v && existingAgents.some(a => a.name === v)) {
                      const agent = existingAgents.find(a => a.name === v)
                      if (agent) loadAgent(agent)
                    }
                  }}
                  onInputChange={(_, v) => {
                    setForm(f => ({ ...f, name: v || '' }))
                    if (existingAgents.some(a => a.name === v)) {
                      const agent = existingAgents.find(a => a.name === v)
                      if (agent) loadAgent(agent)
                    }
                  }}
                  renderInput={(p) => <TextField {...p} label="Agent Name" size="small" required />}
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
                  onChange={(_, v) => setForm(f => ({ ...f, model_id: v?.id || '' }))}
                  renderInput={(p) => <TextField {...p} label="Model Configuration" size="small" />}
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
                  options={knowledgeCollections}
                  getOptionLabel={(o) => o?.name || ''}
                  value={knowledgeCollections.find(c => c.id === form.knowledge_collection_id) || null}
                  onChange={(_, v) => setForm(f => ({ ...f, knowledge_collection_id: v?.id || '' }))}
                  renderInput={(p) => <TextField {...p} label="Knowledge Collection" size="small" />}
                />

                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Memory</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant={form.memory?.history?.enabled ? 'contained' : 'outlined'}
                      onClick={() => setForm(f => ({ ...f, memory: { ...(f.memory||{}), history: { enabled: !f.memory?.history?.enabled, num: f.memory?.history?.num ?? 3 } } }))}
                    >
                      History {form.memory?.history?.enabled ? 'On' : 'Off'}
                    </Button>
                    {form.memory?.history?.enabled && (
                      <TextField
                        type="number"
                        size="small"
                        label="Num"
                        value={form.memory?.history?.num ?? 3}
                        onChange={e => setForm(f => ({ ...f, memory: { ...(f.memory||{}), history: { enabled: true, num: Number(e.target.value || 0) } } }))}
                        sx={{ width: 120 }}
                      />
                    )}
                  </Stack>
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
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save Agent'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
