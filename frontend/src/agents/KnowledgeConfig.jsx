import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Paper,
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
  Fade
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

function useAuthToken() {
  const token = useMemo(() => localStorage.getItem('token'), [])
  return token
}

const api = {
  async getDefaults(token) {
    const r = await fetch('/api/knowledge/defaults', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getCategories(token) {
    const r = await fetch('/api/knowledge/categories', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getPrefixes(token) {
    const r = await fetch('/api/knowledge/prefixes', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return r.json()
  },
  async getPrefix(prefix, token) {
    const r = await fetch(`/api/knowledge/prefix/${encodeURIComponent(prefix)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!r.ok) throw new Error('Failed to load prefix')
    return r.json()
  },
  async savePrefix(body, token) {
    const r = await fetch('/api/knowledge/prefix/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
    return r.json()
  },
  async deletePrefix(prefix, token) {
    const r = await fetch(`/api/knowledge/prefix/${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!r.ok) throw new Error('Delete failed')
    return r.json()
  },
  async uploadFiles(prefix, files, token) {
    const fd = new FormData()
    fd.append('prefix', prefix)
    for (const f of files) fd.append('files', f)
    const r = await fetch(`/api/knowledge/upload?prefix=${encodeURIComponent(prefix)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    })
    if (!r.ok) throw new Error('Upload failed')
    return r.json()
  },
  async discoverChunking() {
    const r = await fetch('/api/discovery/components?folder=document/chunking')
    return r.json()
  },
  async introspect(module_path) {
    const r = await fetch('/api/discovery/introspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_path, kind: 'chunk' })
    })
    return r.json()
  }
}

export default function KnowledgeConfig() {
  const theme = useTheme()
  const token = useAuthToken()

  const [loading, setLoading] = useState(true)
  const [prefixes, setPrefixes] = useState([])
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

  useEffect(() => {
    // Boot: defaults, categories, prefixes, chunking discovery
    Promise.all([
      api.getDefaults(token),
      api.getCategories(token),
      api.getPrefixes(token),
      api.discoverChunking()
    ]).then(([d, c, p, comps]) => {
      setDefaults(d.defaults || {})
      setCategories(c.categories || [])
      setPrefixes(p.prefixes || [])
      const chunking = (comps.components?.['document/chunking'] || []).concat(comps.components?.chunking || [])
      setComponents({ chunking })
    }).catch(err => console.error(err)).finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (form.chunk_strategy && !introspection[form.chunk_strategy]) {
      api.introspect(form.chunk_strategy).then(info => {
        setIntrospection(prev => ({ ...prev, [form.chunk_strategy]: info }))
      }).catch(() => {})
    }
  }, [form.chunk_strategy])

  const loadExisting = async (name) => {
    setLoading(true)
    try {
      const data = await api.getPrefix(name, token)
      setForm({
        name: data.prefix,
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
        prefix: form.name,
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
      const res = await api.savePrefix(payload, token)
      if (pendingFiles.length > 0) {
        await api.uploadFiles(form.name, pendingFiles, token)
        setPendingFiles([])
      }
      if (res.exists) {
        // Save again forcing overwrite
        await api.savePrefix({ ...payload, overwrite: true }, token)
      }
      // refresh lists
      const pfx = await api.getPrefixes(token)
      setPrefixes(pfx.prefixes || [])
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
      await api.deletePrefix(form.name, token)
      setForm({ name: '', category: '', chunk_strategy: '', chunk_strategy_params: {}, chunk_size: defaults.chunk_size || 5000, chunk_overlap: defaults.chunk_overlap || 0 })
      setIsEdit(false)
      const pfx = await api.getPrefixes(token)
      setPrefixes(pfx.prefixes || [])
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

  return (
    <Paper variant="section" sx={{ p: 2 }}>
      {(saveBusy) && (
        <Fade in timeout={400}>
          <LinearProgress sx={{ mb: 2 }} />
        </Fade>
      )}
      <Typography variant="h4" gutterBottom>
        Knowledge Config {isEdit && <Typography component="span" variant="body2" sx={{ color: 'warning.main' }}>(Editing)</Typography>}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Autocomplete
          freeSolo fullWidth
          options={prefixes}
          value={form.name}
          onChange={(_, v) => {
            if (v && prefixes.includes(v)) loadExisting(v)
            else { setForm(f => ({ ...f, name: v || '' })); setIsEdit(false) }
          }}
          onInputChange={(_, v) => {
            setForm(f => ({ ...f, name: v || '' }))
          }}
          renderInput={(params) => (
            <TextField {...params} label="Prefix Name" placeholder="Enter or select a prefix…" size="small" required />
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
                  {(components.chunking || []).map(c => (
                    <MenuItem key={c} value={c}>{c.split('.').pop()}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" size="small" onClick={async () => {
                const comps = await api.discoverChunking()
                const chunking = (comps.components?.['document/chunking'] || []).concat(comps.components?.chunking || [])
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

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'grey.200' }}>
          {isEdit && (
            <Button size="large" variant="outlined" color="error" onClick={onDelete} sx={{ mr: 'auto' }} disabled={saveBusy}>Delete</Button>
          )}
          <Button size="large" variant="contained" disabled={!form.name || saveBusy} onClick={save}>
            {saveBusy ? (isEdit ? 'Updating…' : 'Saving…') : (isEdit ? 'Update Prefix' : 'Create Prefix')}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
