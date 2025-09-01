import React, { useEffect, useState, useCallback, useContext } from 'react';
import { Box, Button, TextField, Paper, Typography, CircularProgress, Autocomplete, LinearProgress, Fade, useTheme, Stack } from '@mui/material';

export default function ModelConfig() {
    const theme = useTheme();
    
    // Simple auth context replacement
    const token = null; // Replace with actual auth implementation
    
    // Simple snackbar replacement
    const showSuccess = (msg) => alert(`Success: ${msg}`);
    const showError = (msg) => alert(`Error: ${msg}`);
    const showWarning = (msg) => alert(`Warning: ${msg}`);
    
    // Simple backend base function replacement
    const backendBase = () => import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

    const [components, setComponents] = useState({ models: [] });
    const [loadingDiscovery, setLoadingDiscovery] = useState(true);
    const [introspectCache, setIntrospectCache] = useState({});
    const [pendingIntros, setPendingIntros] = useState({});
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [globalDefaults, setGlobalDefaults] = useState({});
    const [form, setForm] = useState({
        name: '',
        category: '',
        model: '',
        model_params: {}
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Discover components using HTTP
    const discoverComponents = useCallback(async () => {
        try {
            setLoadingDiscovery(true);
            const response = await fetch(`${backendBase()}/api/model-config/components?folder=models`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (response.ok) {
                const data = await response.json();
                const comps = data?.components || {};
                setComponents({ models: comps.models || [] });
            } else {
                showError('Failed to discover models');
            }
        } catch (error) {
            console.error('Failed to discover models:', error);
            showError('Failed to discover models');
        } finally {
            setLoadingDiscovery(false);
        }
    }, [token, showError]);

    // Introspect model using HTTP
    const introspectModel = useCallback(async (modulePath, kind = 'model') => {
        if (!modulePath || introspectCache[modulePath] || pendingIntros[modulePath]) return;
        
        try {
            setPendingIntros(p => ({ ...p, [modulePath]: true }));
            
            const response = await fetch(`${backendBase()}/api/model-config/introspect`, {
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
                showError(`Failed to introspect model: ${modulePath}`);
            }
        } catch (error) {
            console.error('Failed to introspect model:', error);
            showError('Failed to introspect model');
        } finally {
            setPendingIntros(p => { const { [modulePath]: _rm, ...rest } = p; return rest; });
        }
    }, [token, introspectCache, pendingIntros, showError]);

    // Load global defaults from backend (removed - not supported by new model config routes)
    const loadGlobalDefaults = useCallback(async () => {
        // This functionality was removed as it's not part of the model config routes
        setGlobalDefaults({});
    }, []);

    const loadCategories = useCallback(async () => {
        try {
            setLoadingCategories(true);
            const response = await fetch(`${backendBase()}/api/model-config/categories`, {
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
    }, [token]);

    // Show warning when no models are discovered
    useEffect(() => {
        if (!loadingDiscovery && components.models.length === 0) {
            showWarning('No models discovered. Check backend logs or refresh.');
        }
    }, [loadingDiscovery, components.models, showWarning]);

    const loadExistingConfigs = useCallback(async () => {
        try {
            const resp = await fetch(`${backendBase()}/api/model-config/configs`, {
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
    }, [token]);

    useEffect(() => { discoverComponents(); }, [discoverComponents]);
    useEffect(() => { loadExistingConfigs(); }, [loadExistingConfigs]);
    useEffect(() => { loadGlobalDefaults(); }, [loadGlobalDefaults]);
    useEffect(() => { loadCategories(); }, [loadCategories]);

    function ensureIntrospection(path, kind) {
        if (!path || introspectCache[path]) return;
        introspectModel(path, kind);
    }

    function loadExistingConfig(configName) {
        const config = existingConfigs.find(c => c.name === configName);
        if (config) {
            setForm({
                ...config,
                name: config.name,
                category: config.category || '',
                model: config.model,
                model_params: config.model_params || {}
            });
            setIsEditMode(true);
            if (config.model) {
                ensureIntrospection(config.model, 'model');
            }
        } else {
            setForm({
                name: configName,
                category: '',
                model: '',
                model_params: {},
                ...globalDefaults
            });
            setIsEditMode(false);
        }
    }

    async function saveModelConfig() {
        if (!form.name || !form.model) {
            showError('Name and model selection are required');
            return;
        }

        setSaveState(s => ({ ...s, loading: true }));
        
        const configToSave = {
            name: form.name,
            category: form.category || '',
            model: form.model,
            model_params: form.model_params,
            type: 'model_config'
        };

        try {
            const resp = await fetch(`${backendBase()}/api/model-config/configs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(configToSave)
            });
            
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showError(data.detail || `Save failed (HTTP ${resp.status})`);
                setSaveState({ loading: false });
                return;
            }
            
            const action = isEditMode ? 'updated' : 'saved';
            showSuccess(`Model configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            
            // Reload existing configs and reset form after successful save
            loadExistingConfigs();
            loadCategories();
            setForm({
                name: '',
                category: '',
                model: '',
                model_params: {},
                ...globalDefaults
            });
            setIsEditMode(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    const modelIntro = form.model ? introspectCache[form.model] : null;

    return (
        <>
            {(loadingDiscovery || loadingConfigs || Object.keys(pendingIntros).length > 0 || saveState.loading) && (
                <Fade in timeout={400}>
                    <LinearProgress sx={{ mb: 2, borderRadius: theme.custom.borderRadius.small }} />
                </Fade>
            )}
            
            <Paper variant="section">
                <Typography variant="h4" gutterBottom>
                    Model Configuration {isEditMode && <Typography component="span" variant="body2" sx={{ color: 'warning.main' }}>(Editing)</Typography>}
                </Typography>
                <Typography variant="body1" sx={{ mb: 4, opacity: 0.7 }}>
                    Configure and manage AI model settings for your agents. Select models and customize their parameters.
                </Typography>
                
                {loadingDiscovery && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">Discovering models...</Typography>
                    </Box>
                )}
                
                {!loadingDiscovery && Object.keys(pendingIntros).length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            Loading definitions for {Object.keys(pendingIntros).filter(k => !introspectCache[k]).length} item(s)…
                        </Typography>
                    </Box>
                )}

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
                                setForm(f => ({ ...f, name: v || '' }));
                                setIsEditMode(false);
                            }
                        }}
                        onInputChange={(_, v) => {
                            setForm(f => ({ ...f, name: v }));
                            if (existingConfigs.some(c => c.name === v)) {
                                loadExistingConfig(v);
                            } else {
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
                            if (val && !categories.includes(val)) {
                                setCategories(prev => [...prev, val]);
                            }
                        }}
                        onInputChange={(e, val) => {
                            setForm(f => ({ ...f, category: val || '' }));
                            if (val && !categories.includes(val)) {
                                setCategories(prev => [...prev, val]);
                            }
                        }}
                        renderInput={(params) => (
                            <TextField 
                                {...params} 
                                label="Category" 
                                placeholder="Enter or select a category..."
                                size="small"
                            />
                        )}
                    />

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Autocomplete
                            sx={{ flex: 1 }}
                            options={components.models || []}
                            value={form.model}
                            loading={loadingDiscovery && !(components.models || []).length}
                            loadingText="Loading models…"
                            onChange={(_, v) => { 
                                setForm(f => ({ ...f, model: v || '', model_params: {} })); 
                                ensureIntrospection(v, 'model'); 
                            }}
                            renderInput={(params) => <TextField {...params} label="Select Model" />}
                        />
                        <Button 
                            variant="gradientBorder"
                            onClick={discoverComponents}
                        >
                            Refresh
                        </Button>
                    </Box>

                    {!modelIntro && form.model && (
                        <Fade in>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress size={16} />
                                <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching model parameters…</Typography>
                            </Box>
                        </Fade>
                    )}

                    {modelIntro && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Model Parameters ({modelIntro.class_name})
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {(modelIntro.required || []).map(paramName => (
                                    <TextField
                                        key={paramName}
                                        size="small"
                                        label={paramName}
                                        value={form.model_params[paramName] || ''}
                                        onChange={(e) => setForm(f => ({ 
                                            ...f, 
                                            model_params: { ...f.model_params, [paramName]: e.target.value } 
                                        }))}
                                        placeholder={`Enter ${paramName}`}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                        <Button 
                            onClick={saveModelConfig} 
                            disabled={saveState.loading || !form.name || !form.model}
                            color="primary"
                            variant="contained"
                        >
                            {saveState.loading ? 'Saving...' : isEditMode ? 'Update Model Configuration' : 'Save Model Configuration'}
                        </Button>
                    </Box>

                    {saveState.loading && (
                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={18} />
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>Saving configuration…</Typography>
                        </Box>
                    )}
                </Stack>
            </Paper>
        </>
    );
}
