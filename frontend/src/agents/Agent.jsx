import React, { useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, Stack, TextField, Typography, Autocomplete, Paper } from '@mui/material'
import { useSnackbar } from '../contexts/SnackbarContext'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Agent({ user }) {
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [models, setModels] = useState([])
  const [tools, setTools] = useState([])
  const [categories, setCategories] = useState([])
  const [knowledgePrefixes, setKnowledgePrefixes] = useState([])
  const [existingAgents, setExistingAgents] = useState([])

  const [form, setForm] = useState({
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

  async function fetchAll() {
    setLoading(true)
    try {
      const [modelsRes, toolsRes, modelCatsRes, prefixesRes, agentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/model-config/configs`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/tool-config/configs`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/model-config/categories`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/knowledge/prefixes`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/agents`, { headers: authHeaders }),
      ])

      const modelsJson = await modelsRes.json().catch(() => ({}))
      const toolsJson = await toolsRes.json().catch(() => ({}))
      const catsJson = await modelCatsRes.json().catch(() => ({}))
      const prefJson = await prefixesRes.json().catch(() => ({}))
      const agentsJson = await agentsRes.json().catch(() => ({}))

      setModels((modelsJson.configurations || []).map(c => c.name).sort())
      setTools((toolsJson.configurations || []).map(c => c.name).sort())
      setCategories((catsJson.categories || []).sort())
      setKnowledgePrefixes((prefJson.prefixes || []).sort())
      setExistingAgents(agentsJson.agents || [])
    } catch (e) {
      console.error(e)
      showError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const loadAgent = (name) => {
    const agent = existingAgents.find(a => a.name === name)
    if (!agent) return
    setForm({
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
      const resp = await fetch(`${API_BASE_URL}/api/agents`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(form),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Save failed (${resp.status})`)
      showSuccess(`Agent ${data.name} saved`)
      await fetchAll()
    } catch (e) {
      showError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/agents/${encodeURIComponent(form.name)}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || `Delete failed (${resp.status})`)
      showSuccess(`Agent ${form.name} deleted`)
      setForm(f => ({ ...f, name: '' }))
      await fetchAll()
    } catch (e) {
      showError(e.message || 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      {(loading || saving) && (
        <Box sx={{ mb: 2, height: 4, borderRadius: 1, bgcolor: 'action.hover' }} />
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Agents
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and edit AI agents using saved model and tool configurations.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" color="error" disabled={!form.name || saving} onClick={handleDelete}>Delete</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save Agent'}
          </Button>
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <Autocomplete
                  freeSolo
                  options={existingAgents.map(a => a.name)}
                  value={form.name}
                  onChange={(_, v) => {
                    setForm(f => ({ ...f, name: v || '' }))
                    if (v && existingAgents.some(a => a.name === v)) loadAgent(v)
                  }}
                  onInputChange={(_, v) => {
                    setForm(f => ({ ...f, name: v || '' }))
                    if (existingAgents.some(a => a.name === v)) loadAgent(v)
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
        </CardContent>
      </Card>
    </Box>
  )
}
