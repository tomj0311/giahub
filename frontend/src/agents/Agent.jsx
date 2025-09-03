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

import { apiCall } from '../config/api'

export default function Agent({ user }) {
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const [models, setModels] = useState([])
  const [tools, setTools] = useState([])
  const [categories, setCategories] = useState([])
  const [knowledgePrefixes, setKnowledgePrefixes] = useState([])
  const [existingAgents, setExistingAgents] = useState([])

  const [form, setForm] = useState({
    id: null,
    name: '',
    category: '',
    description: '',
    instructions: '',
    model: { name: '' },
    tools: {},
    collection: '',
    memory: { history: { enabled: false, num: 3 } },
  })

  const toolList = Object.keys(form.tools || {})

  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      category: '',
      description: '',
      instructions: '',
      model: { name: '' },
      tools: {},
      collection: '',
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

      setModels((modelsJson.configurations || []).map(c => c.name).sort())
      setTools((toolsJson.configurations || []).map(c => c.name).sort())
      setCategories((catsJson.categories || []).sort())
      setKnowledgePrefixes((collectionsJson.collections || []).sort())
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
      model: agent.model || { name: '' },
      tools: agent.tools || {},
      collection: agent.collection || '',
      memory: agent.memory || { history: { enabled: false, num: 3 } },
    })
  }

  const handleSave = async () => {
    if (!form.name) { showError('Name is required'); return }
    if (!form.model?.name) { showError('Select a model configuration'); return }
    setSaving(true)
    try {
      const resp = await apiCall(`/api/agents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(form),
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
    if (!form.id) return
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

  const handleRowDelete = async (agent) => {
    if (!agent?.id) return
    try {
      setSaving(true)
      const resp = await apiCall(`/api/agents/id/${agent.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Delete failed (${resp.status})`)
      showSuccess(`Agent ${agent.name} deleted`)
      await fetchAll()
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
                    const toolNames = Object.keys(a.tools || {})
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
                        <TableCell>{a.model?.name || '-'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {toolNames.length === 0 ? (
                              <Chip size="small" label="None" />
                            ) : (
                              toolNames.slice(0, 3).map(t => (
                                <Chip key={t} size="small" label={t} variant="outlined" />
                              ))
                            )}
                            {toolNames.length > 3 && (
                              <Chip size="small" label={`+${toolNames.length - 3}`} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{a.collection || '-'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={mem} color={a.memory?.history?.enabled ? 'primary' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="primary" onClick={() => openEdit(a)}>
                            <EditIcon size={16} />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleRowDelete(a)}>
                            <DeleteIcon size={16} />
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
                  value={form.model?.name || ''}
                  onChange={(_, v) => setForm(f => ({ ...f, model: v ? { name: v } : { name: '' } }))}
                  renderInput={(p) => <TextField {...p} label="Model Configuration" size="small" />}
                />

                <Autocomplete
                  multiple
                  options={tools}
                  value={toolList}
                  onChange={(_, v) => {
                    const next = {}
                    v.forEach(t => { next[t] = form.tools?.[t] || {} })
                    setForm(f => ({ ...f, tools: next }))
                  }}
                  renderTags={(value, getTagProps) => value.map((opt, i) => <Chip {...getTagProps({ index: i })} key={opt} size="small" label={opt} />)}
                  renderInput={(p) => <TextField {...p} label="Tools" size="small" />}
                />

                <Autocomplete
                  options={knowledgePrefixes}
                  value={form.collection || ''}
                  onChange={(_, v) => setForm(f => ({ ...f, collection: v || '' }))}
                  renderInput={(p) => <TextField {...p} label="Knowledge Prefix" size="small" />}
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
