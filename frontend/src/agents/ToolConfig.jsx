import React, { useEffect, useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Typography,
    CircularProgress,
    Autocomplete,
    Fade,
    Stack,
    Card,
    CardContent,
    Grid,
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
    Paper,
    IconButton
} from '@mui/material';
import { api } from '../config/api';
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from 'lucide-react';
import { useSnackbar } from '../contexts/SnackbarContext';

export default function ToolConfig({ user }) {
    const token = user?.token;
    const { showSuccess, showError, showWarning } = useSnackbar();
    

    const [components, setComponents] = useState({ functions: [] });
    const [loadingDiscovery, setLoadingDiscovery] = useState(true);
    const [introspectCache, setIntrospectCache] = useState({});
    const [pendingIntros, setPendingIntros] = useState({});
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState({
        id: null,
        name: '',
        category: '',
        tool: '',
        tool_params: {}
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    const discoverComponents = async () => {
        try {
            setLoadingDiscovery(true);
            const response = await api(`/api/tool-config/components?folder=ai.functions`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (response.ok) {
                const data = await response.json();
                const comps = data?.components || {};
                setComponents({ functions: comps['ai.functions'] || [] });
            } else {
                showError('Failed to discover tools');
            }
        } catch (error) {
            console.error('Failed to discover tools:', error);
            showError('Failed to discover tools');
        } finally {
            setLoadingDiscovery(false);
        }
    };

    const introspectTool = async (modulePath, kind = 'tool') => {
        if (!modulePath || introspectCache[modulePath] || pendingIntros[modulePath]) return;
        try {
            setPendingIntros(p => ({ ...p, [modulePath]: true }));
            const response = await api(`/api/tool-config/introspect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ module_path: modulePath, kind })
            });
            if (response.ok) {
                const data = await response.json();
                setIntrospectCache(c => ({ ...c, [modulePath]: data }));
            } else {
                showError(`Failed to introspect tool: ${modulePath}`);
            }
        } catch (error) {
            console.error('Failed to introspect tool:', error);
            showError('Failed to introspect tool');
        } finally {
            setPendingIntros(p => { const { [modulePath]: _rm, ...rest } = p; return rest; });
        }
    };

    const loadCategories = async () => {
        try {
            setLoadingCategories(true);
            const response = await api(`/api/tool-config/categories`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (response.ok) {
                const data = await response.json();
                setCategories(data.categories || []);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        } finally {
            setLoadingCategories(false);
        }
    };

    const loadExistingConfigs = async () => {
        try {
            const resp = await api(`/api/tool-config/configs`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            if (resp.ok) {
                const data = await resp.json();
                setExistingConfigs(data.configurations || []);
            }
        } catch (e) {
            console.error('Failed to load existing configurations:', e);
        } finally {
            setLoadingConfigs(false);
        }
    };

    useEffect(() => {
        if (!loadingDiscovery && components.functions.length === 0) {
            showWarning('No tools discovered. Check backend logs or refresh.');
        }
    }, [loadingDiscovery, components.functions]);

    useEffect(() => {
        discoverComponents();
        loadExistingConfigs();
        loadCategories();
    }, []);

    function ensureIntrospection(path, kind) {
        if (!path || introspectCache[path]) return;
        introspectTool(path, kind);
    }

    function loadExistingConfig(configName) {
        const config = existingConfigs.find(c => c.name === configName);
        if (config) {
            setForm({
                ...config,
                id: config.id,
                name: config.name,
                category: config.category || '',
                tool: config.tool,
                tool_params: config.tool_params || {}
            });
            setIsEditMode(true);
            if (config.tool) {
                ensureIntrospection(config.tool, 'tool');
            }
        } else {
            setForm({ id: null, name: configName, category: '', tool: '', tool_params: {} });
            setIsEditMode(false);
        }
    }

    async function saveToolConfig() {
        if (!form.name || !form.tool) {
            showError('Name and tool selection are required');
            return;
        }
        setSaveState(s => ({ ...s, loading: true }));
        const configToSave = {
            name: form.name,
            category: form.category || '',
            tool: form.tool,
            tool_params: form.tool_params,
            type: 'toolConfig'
        };
        try {
            let resp;
            if (isEditMode && form.id) {
                resp = await api(`/api/tool-config/configs/${form.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            } else {
                resp = await api(`/api/tool-config/configs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            }
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showError(data.detail || `Save failed (HTTP ${resp.status})`);
                setSaveState({ loading: false });
                return;
            }
            const action = isEditMode ? 'updated' : 'saved';
            showSuccess(`Tool configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            loadExistingConfigs();
            loadCategories();
            setForm({ id: null, name: '', category: '', tool: '', tool_params: {} });
            setIsEditMode(false);
            setDialogOpen(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    async function deleteToolConfig(id) {
        if (!id) return;
        try {
            setSaveState({ loading: true });
            const resp = await api(`/api/tool-config/configs/${id}`, {
                method: 'DELETE',
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showError(data.detail || `Delete failed (HTTP ${resp.status})`);
                setSaveState({ loading: false });
                return;
            }
            showSuccess('Tool configuration deleted');
            await loadExistingConfigs();
            setSaveState({ loading: false });
            setDialogOpen(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    const openCreate = () => {
        setForm({ id: null, name: '', category: '', tool: '', tool_params: {} });
        setIsEditMode(false);
        setDialogOpen(true);
    };

    const openEdit = (name) => {
        loadExistingConfig(name);
        setDialogOpen(true);
    };

    const toolIntro = form.tool ? introspectCache[form.tool] : null;

    return (
        <Box>
            {(loadingDiscovery || loadingConfigs || Object.keys(pendingIntros).length > 0 || saveState.loading) && (
                <Fade in timeout={400}>
                    <Box sx={{ mb: 2, height: 4, borderRadius: '4px', bgcolor: 'action.hover' }} />
                </Fade>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Tool Configurations
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Discover tools from ai.functions and configure their parameters.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>Create Configuration</Button>
            </Box>

            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">All Tool Configs ({existingConfigs.length})</Typography>
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Tool</TableCell>
                                    <TableCell>Params</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {existingConfigs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">No configurations found</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    existingConfigs.map(cfg => (
                                        <TableRow key={cfg.id || cfg.name} hover>
                                            <TableCell>{cfg.name}</TableCell>
                                            <TableCell>{cfg.category || '-'}</TableCell>
                                            <TableCell>{cfg.tool || '-'}</TableCell>
                                            <TableCell>{Object.keys(cfg.tool_params || {}).length}</TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" color="primary" onClick={() => openEdit(cfg.name)}>
                                                    <EditIcon size={16} />
                                                </IconButton>
                                                {cfg.id && (
                                                    <IconButton size="small" color="error" onClick={() => deleteToolConfig(cfg.id)}>
                                                        <DeleteIcon size={16} />
                                                    </IconButton>
                                                )}
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
                <DialogTitle>{isEditMode ? 'Edit Tool Configuration' : 'Create Tool Configuration'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                            {existingConfigs.length > 0 && 'Start typing to search existing configurations or enter a new name.'}
                        </Typography>

                        <Autocomplete
                            freeSolo
                            fullWidth
                            options={existingConfigs.map(c => c.name)}
                            value={form.name}
                            loading={loadingConfigs}
                            loadingText="Loading configurations…"
                            onChange={(_, v) => {
                                if (v && existingConfigs.some(c => c.name === v)) {
                                    loadExistingConfig(v);
                                } else {
                                    setForm(f => ({ ...f, id: null, name: v || '' }));
                                    setIsEditMode(false);
                                }
                            }}
                            onInputChange={(_, v) => {
                                setForm(f => ({ ...f, name: v }));
                                if (existingConfigs.some(c => c.name === v)) {
                                    loadExistingConfig(v);
                                } else {
                                    setForm(f => ({ ...f, id: null }));
                                    setIsEditMode(false);
                                }
                            }}
                            renderInput={(params) =>
                                <TextField
                                    {...params}
                                    label="Configuration Name"
                                    placeholder="Enter a short descriptive name"
                                    size="small"
                                    required
                                />
                            }
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
                                setForm(f => ({ ...f, category: val || '' }));
                                if (val && !categories.includes(val)) setCategories(prev => [...prev, val]);
                            }}
                            onInputChange={(e, val) => {
                                setForm(f => ({ ...f, category: val || '' }));
                                if (val && !categories.includes(val)) setCategories(prev => [...prev, val]);
                            }}
                            renderInput={(params) => (
                                <TextField {...params} label="Category" placeholder="Enter or select a category..." size="small" />
                            )}
                        />

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Autocomplete
                                sx={{ flex: 1 }}
                                options={components.functions || []}
                                value={form.tool}
                                loading={loadingDiscovery && !(components.functions || []).length}
                                loadingText="Loading tools…"
                                onChange={(_, v) => {
                                    setForm(f => ({ ...f, tool: v || '', tool_params: {} }));
                                    ensureIntrospection(v, 'tool');
                                }}
                                renderInput={(params) => <TextField {...params} label="Select Tool" />}
                            />
                            <Button variant="gradientBorder" size="medium" onClick={discoverComponents}>Refresh</Button>
                        </Box>

                        {!toolIntro && form.tool && (
                            <Fade in>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={16} />
                                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching tool parameters…</Typography>
                                </Box>
                            </Fade>
                        )}

                        {toolIntro && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Tool Parameters ({toolIntro.class_name})
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                                    {(toolIntro.formatted_params || []).map(paramFormatted => {
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
                                        if (paramType.includes('int') || paramType.includes('float') || paramType.includes('bool')) gridColumn = 'span 1';
                                        else if (paramType.includes('str') && (paramName.includes('key') || paramName.includes('token') || paramName.includes('url'))) gridColumn = 'span 2';
                                        return (
                                            <TextField
                                                key={paramName}
                                                size="small"
                                                label={paramName}
                                                InputLabelProps={{ shrink: true }}
                                                value={form.tool_params[paramName] || ''}
                                                onChange={(e) => setForm(f => ({ ...f, tool_params: { ...f.tool_params, [paramName]: e.target.value } }))}
                                                placeholder={placeholderText}
                                                sx={{ gridColumn }}
                                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                            />
                                        );
                                    })}
                                </Box>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    {isEditMode && form.id && (
                        <Button color="error" onClick={() => deleteToolConfig(form.id)} startIcon={<DeleteIcon size={16} />}>Delete</Button>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={saveToolConfig} variant="contained" disabled={saveState.loading || !form.name || !form.tool}>
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Configuration' : 'Save Configuration'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
