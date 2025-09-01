import React, { useEffect, useState } from 'react';
import { Box, Button, TextField, Paper, Typography, CircularProgress, Autocomplete, LinearProgress, Fade, Stack, Card, CardContent, Grid } from '@mui/material';
import { useSnackbar } from '../contexts/SnackbarContext';

export default function ModelConfig({ user }) {
    // Use the user token from props (same pattern as other dashboard components)
    const token = user?.token;
    
    const { showSuccess, showError, showWarning, showInfo } = useSnackbar();
    
    // Simple backend base function replacement
    const backendBase = () => import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

    const [components, setComponents] = useState({ models: [] });
    const [loadingDiscovery, setLoadingDiscovery] = useState(true);
    const [introspectCache, setIntrospectCache] = useState({});
    const [pendingIntros, setPendingIntros] = useState({});
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [form, setForm] = useState({
        id: null,
        name: '',
        category: '',
        model: '',
        model_params: {}
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Discover components using HTTP
    const discoverComponents = async () => {
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
    };

    // Introspect model using HTTP
    const introspectModel = async (modulePath, kind = 'model') => {
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
    };

    const loadCategories = async () => {
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
    };

    const loadExistingConfigs = async () => {
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
    };

    // Show warning when no models are discovered
    useEffect(() => {
        if (!loadingDiscovery && components.models.length === 0) {
            showWarning('No models discovered. Check backend logs or refresh.');
        }
    }, [loadingDiscovery, components.models]);

    // Run these functions only once on mount
    useEffect(() => {
        discoverComponents();
        loadExistingConfigs();
        loadCategories();
    }, []);

    function ensureIntrospection(path, kind) {
        if (!path || introspectCache[path]) return;
        introspectModel(path, kind);
    }

    function loadExistingConfig(configName) {
        const config = existingConfigs.find(c => c.name === configName);
        if (config) {
            setForm({
                ...config,
                id: config.id,
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
                id: null,
                name: configName,
                category: '',
                model: '',
                model_params: {}
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
            let resp;
            if (isEditMode && form.id) {
                // Update existing configuration
                resp = await fetch(`${backendBase()}/api/model-config/configs/${form.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify(configToSave)
                });
            } else {
                // Create new configuration
                resp = await fetch(`${backendBase()}/api/model-config/configs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
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
            showSuccess(`Model configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            
            // Reload existing configs and reset form after successful save
            loadExistingConfigs();
            loadCategories();
            setForm({
                id: null,
                name: '',
                category: '',
                model: '',
                model_params: {}
            });
            setIsEditMode(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    const modelIntro = form.model ? introspectCache[form.model] : null;

    return (
        <Box>
            {(loadingDiscovery || loadingConfigs || Object.keys(pendingIntros).length > 0 || saveState.loading) && (
                <Fade in timeout={400}>
                    <LinearProgress sx={{ mb: 2, borderRadius: '4px' }} />
                </Fade>
            )}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Model Configuration {isEditMode && <Typography component="span" variant="body2" sx={{ color: 'warning.main' }}>(Editing)</Typography>}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Configure and manage AI model settings for your agents. Select models and customize their parameters.
                    </Typography>
                </Box>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                
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
                            size="medium"
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
                            <Box sx={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: 2
                            }}>
                                {(modelIntro.formatted_params || []).map(paramFormatted => {
                                    // Extract parameter name and type from formatted string
                                    const paramName = paramFormatted.split(':')[0].trim();
                                    const typeMatch = paramFormatted.match(/:\s*([^=\s]+)/);
                                    const paramType = typeMatch ? typeMatch[1].toLowerCase() : 'str';
                                    
                                    // Determine field width based on type
                                    let gridColumn = 'span 1';
                                    if (paramType.includes('int') || paramType.includes('float') || paramType.includes('bool')) {
                                        gridColumn = 'span 1'; // Smaller for numeric/boolean
                                    } else if (paramType.includes('str') && (paramName.includes('key') || paramName.includes('token') || paramName.includes('url'))) {
                                        gridColumn = 'span 2'; // Larger for API keys, URLs, etc.
                                    }
                                    
                                    return (
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
                                            sx={{ gridColumn }}
                                            type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                        />
                                    );
                                })}
                            </Box>
                        </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                        <Button 
                            onClick={saveModelConfig} 
                            disabled={saveState.loading || !form.name || !form.model}
                            color="primary"
                            variant="contained"
                            size="medium"
                        >
                            {saveState.loading ? 'Saving...' : isEditMode ? 'Update Model Configuration' : 'Save Model Configuration'}
                        </Button>
                    </Box>
                </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
