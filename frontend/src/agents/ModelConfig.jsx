import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    IconButton,
    TablePagination
} from '@mui/material';
import { apiCall } from '../config/api';
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from 'lucide-react';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useConfirmation } from '../contexts/ConfirmationContext';

function ModelConfig({ user }) {
    // Use the user token from props (same pattern as other dashboard components)
    const token = user?.token;

    const { showSuccess, showError, showWarning, showInfo } = useSnackbar();
    const { showDeleteConfirmation } = useConfirmation();

    // Add ref to track if component is mounted
    const isMountedRef = useRef(true);

    // Simple backend base function replacement
    

    const [components, setComponents] = useState({ models: [], embeddings: [] });
    const [loadingDiscovery, setLoadingDiscovery] = useState(true);
    const [introspectCache, setIntrospectCache] = useState({});
    const [pendingIntros, setPendingIntros] = useState({});
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [pagination, setPagination] = useState({
        page: 0, // MUI uses 0-based pagination
        rowsPerPage: 8,
        total: 0,
        totalPages: 0
    });
    const [isEditMode, setIsEditMode] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState({
        id: null,
        name: '',
        category: '',
        model: '',
        model_params: {},
        embedding: '',
        embedding_params: {}
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Discover components using HTTP
    const discoverComponents = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        try {
            setLoadingDiscovery(true);
            
            // Discover models
            const modelsResponse = await apiCall(`/api/models/components?folder=ai.models`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            // Discover embeddings
            const embeddingsResponse = await apiCall(`/api/models/components?folder=ai.embeddings`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });

            let models = [];
            let embeddings = [];

            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json();
                const comps = modelsData?.components || {};
                models = comps['ai.models'] || [];
            } else {
                if (isMountedRef.current) {
                    showError('Failed to discover models');
                }
            }

            if (embeddingsResponse.ok) {
                const embeddingsData = await embeddingsResponse.json();
                const comps = embeddingsData?.components || {};
                embeddings = comps['ai.embeddings'] || [];
            } else {
                if (isMountedRef.current) {
                    showError('Failed to discover embeddings');
                }
            }

            if (isMountedRef.current) {
                setComponents({ models, embeddings });
            }
        } catch (error) {
            console.error('Failed to discover components:', error);
            if (isMountedRef.current) {
                showError('Failed to discover components');
            }
        } finally {
            if (isMountedRef.current) {
                setLoadingDiscovery(false);
            }
        }
    }, [token]); // Remove showError - it's unstable

    // Introspect model or embedding using HTTP
    const introspectModel = async (modulePath, kind = 'model') => {
        if (!modulePath || introspectCache[modulePath] || pendingIntros[modulePath]) return;

        try {
            setPendingIntros(p => ({ ...p, [modulePath]: true }));

            const endpoint = '/api/models/introspect';
            const response = await apiCall(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ module_path: modulePath, kind: kind === 'embedding' ? 'embedding' : kind })
            });

            if (response.ok) {
                const data = await response.json();
                setIntrospectCache(c => ({ ...c, [modulePath]: data }));
            } else {
                showError(`Failed to introspect ${kind}: ${modulePath}`);
            }
        } catch (error) {
            console.error(`Failed to introspect ${kind}:`, error);
            showError(`Failed to introspect ${kind}`);
        } finally {
            setPendingIntros(p => { const { [modulePath]: _rm, ...rest } = p; return rest; });
        }
    };

    const loadCategories = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        console.log('🏷️ LOADING CATEGORIES...');
        try {
            setLoadingCategories(true);
            const response = await apiCall(`/api/models/categories`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            console.log('📡 Load categories response:', response.status, response.ok);
            if (response.ok) {
                const data = await response.json();
                console.log('📄 Categories data:', data);
                if (isMountedRef.current) {
                    setCategories(data.categories || []);
                }
                console.log('✅ Categories loaded successfully');
            } else {
                console.log('❌ Failed to load categories - bad response');
            }
        } catch (error) {
            console.log('💥 ERROR loading categories:', error);
            console.error('Failed to load categories:', error);
        } finally {
            if (isMountedRef.current) {
                setLoadingCategories(false);
            }
            console.log('🏁 Load categories finished');
        }
    }, [token]);

    const loadExistingConfigs = useCallback(async (page = 1, pageSize = 8) => {
        if (!isMountedRef.current) return;
        
        console.log('🔄 LOADING EXISTING CONFIGS...');
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                page_size: pageSize.toString(),
                sort_by: 'name',
                sort_order: 'asc'
            });
            
            const resp = await apiCall(`/api/models/configs?${queryParams}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            console.log('📡 Load configs response:', resp.status, resp.ok);
            if (resp.ok) {
                const data = await resp.json();
                console.log('📄 Configs data:', data);
                console.log('📄 First config embedding data:', data.configurations?.[0]?.embedding);
                if (isMountedRef.current) {
                    setExistingConfigs(data.configurations || []);
                    if (data.pagination) {
                        setPagination({
                            page: data.pagination.page - 1, // Convert to 0-based for MUI
                            rowsPerPage: data.pagination.page_size,
                            total: data.pagination.total,
                            totalPages: data.pagination.total_pages
                        });
                    }
                }
                console.log('✅ Configs loaded successfully');
            } else {
                console.log('❌ Failed to load configs - bad response');
            }
        } catch (e) {
            console.log('💥 ERROR loading configs:', e);
            console.error('Failed to load existing configurations:', e);
        } finally {
            if (isMountedRef.current) {
                setLoadingConfigs(false);
            }
            console.log('🏁 Load configs finished');
        }
    }, [token]);

    const handlePageChange = (event, newPage) => {
        if (!loadingConfigs && !saveState.loading) {
            loadExistingConfigs(newPage + 1, pagination.rowsPerPage); // Convert to 1-based for API
        }
    };

    const handleRowsPerPageChange = (event) => {
        if (!loadingConfigs && !saveState.loading) {
            const newRowsPerPage = parseInt(event.target.value, 10);
            loadExistingConfigs(1, newRowsPerPage); // Reset to first page
        }
    };

    // Show warning when no models or embeddings are discovered
    useEffect(() => {
        if (!loadingDiscovery && components.models.length === 0 && components.embeddings.length === 0) {
            showWarning('No models or embeddings discovered. Check backend logs or refresh.');
        }
    }, [loadingDiscovery, components.models, components.embeddings, showWarning]);

    // Use exact same pattern as KnowledgeConfig
    useEffect(() => {
        const loadData = async () => {
            console.log('🚀 MODELCONFIG COMPONENT MOUNTED - Starting initialization...');
            if (!isMountedRef.current) return;
            
            try {
                // Load components first
                await discoverComponents();
                
                // Load configs and categories
                await Promise.all([
                    loadExistingConfigs(),
                    loadCategories()
                ]);
                
            } catch (err) {
                console.error('❌ MODELCONFIG Error during initialization:', err);
            }
        };
        
        loadData();
    }, [discoverComponents, loadExistingConfigs, loadCategories]);

    // Cleanup function to handle component unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    function ensureIntrospection(path, kind) {
        if (!path || introspectCache[path]) return;
        introspectModel(path, kind);
    }

    function loadExistingConfig(configName) {
        console.log('🔍 LOADING EXISTING CONFIG:', configName);
        const config = existingConfigs.find(c => c.name === configName);
        console.log('Found config:', config);
        if (config) {
            console.log('✅ Config found, setting form...');
            setForm({
                ...config,
                id: config.id,
                name: config.name,
                category: config.category || '',
                model: config.model?.strategy || '',
                model_params: config.model?.params || {},
                embedding: config.embedding?.strategy || '',
                embedding_params: config.embedding?.params || {}
            });
            setIsEditMode(true);
            if (config.model?.strategy) {
                ensureIntrospection(config.model.strategy, 'model');
            }
            if (config.embedding?.strategy) {
                ensureIntrospection(config.embedding.strategy, 'embedding');
            }
            console.log('✅ Form set to edit mode');
        } else {
            console.log('⚠️ Config not found, creating new...');
            setForm({ id: null, name: configName, category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
            setIsEditMode(false);
            console.log('✅ Form set to create mode');
        }
    }

    async function saveModelConfig() {
        console.log('🚀 SAVE FUNCTION STARTED');
        console.log('Form data:', form);
        console.log('Token:', token ? 'Present' : 'Missing');
        console.log('IsEditMode:', isEditMode);
        
        if (!form.name || !form.model || !form.embedding) {
            console.log('❌ VALIDATION FAILED - Missing name, model or embedding');
            showError('Name, model selection and embedding selection are required');
            return;
        }
        
        console.log('✅ VALIDATION PASSED');
        setSaveState(s => ({ ...s, loading: true }));
        console.log('💾 Save state set to loading');
        
        const configToSave = {
            name: form.name,
            category: form.category || '',
            model: {
                strategy: form.model,
                params: form.model_params
            },
            embedding: {
                strategy: form.embedding,
                params: form.embedding_params
            },
            type: 'modelConfig'
        };
        console.log('📦 Config to save:', configToSave);
        
        try {
            console.log('🌐 Starting API call...');
            let resp;
            if (isEditMode && form.id) {
                console.log('📝 UPDATE mode - ID:', form.id);
                resp = await apiCall(`/api/models/configs/${form.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            } else {
                console.log('✨ CREATE mode');
                resp = await apiCall(`/api/models/configs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            }
            console.log('📡 API response received:', resp.status, resp.ok);
            
            const data = await resp.json().catch(() => ({}));
            console.log('📄 Response data:', data);
            console.log('📄 Response data detail:', JSON.stringify(data.detail, null, 2));
            
            if (!resp.ok) {
                console.log('❌ API ERROR:', data.detail || `Save failed (HTTP ${resp.status})`);
                
                // Handle validation errors (422) which come as an array
                let errorMessage = `Save failed (HTTP ${resp.status})`;
                if (data.detail) {
                    if (Array.isArray(data.detail)) {
                        // Extract error messages from validation error array
                        errorMessage = data.detail.map(err => {
                            if (typeof err === 'object' && err.msg) {
                                return `${err.loc ? err.loc.join('.') + ': ' : ''}${err.msg}`;
                            }
                            return String(err);
                        }).join(', ');
                    } else {
                        errorMessage = data.detail;
                    }
                }
                
                console.log('📝 Formatted error message:', errorMessage);
                showError(errorMessage);
                setSaveState({ loading: false });
                console.log('🔄 Save state reset to not loading');
                return;
            }
            
            const action = isEditMode ? 'updated' : 'saved';
            console.log('✅ SUCCESS! Action:', action);
            showSuccess(`Model configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            console.log('🔄 Save state reset to not loading');
            
            console.log('🔄 Reloading configs and categories...');
            if (isMountedRef.current) {
                loadExistingConfigs();
                loadCategories();
            }
            
            console.log('🧹 Resetting form...');
            setForm({ id: null, name: '', category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
            setIsEditMode(false);
            setDialogOpen(false);
            console.log('✨ SAVE FUNCTION COMPLETED SUCCESSFULLY');
            
        } catch (e) {
            console.log('💥 CATCH BLOCK ERROR:', e);
            console.error('Full error object:', e);
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
            console.log('🔄 Save state reset to not loading (error)');
        }
    }

    async function deleteModelConfig(id, configName) {
        if (!id) return;
        
        const confirmed = await showDeleteConfirmation({
            itemName: configName || 'configuration',
            itemType: 'model configuration',
        });
        
        if (!confirmed) return;
        
        try {
            setSaveState({ loading: true });
            const resp = await apiCall(`/api/models/configs/${id}`, {
                method: 'DELETE',
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showError(data.detail || `Delete failed (HTTP ${resp.status})`);
                setSaveState({ loading: false });
                return;
            }
            showSuccess('Model configuration deleted');
            if (isMountedRef.current) {
                await loadExistingConfigs();
            }
            setSaveState({ loading: false });
            setDialogOpen(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    const openCreate = () => {
        console.log('➕ OPENING CREATE DIALOG');
        setForm({ id: null, name: '', category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
        setIsEditMode(false);
        setDialogOpen(true);
        console.log('✅ Create dialog opened');
    };

    const openEdit = (configName) => {
        console.log('✏️ OPENING EDIT DIALOG for:', configName);
        loadExistingConfig(configName);
        setDialogOpen(true);
        console.log('✅ Edit dialog opened');
    };

    const modelIntro = form.model ? introspectCache[form.model] : null;
    const embeddingIntro = form.embedding ? introspectCache[form.embedding] : null;

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
                        Model Configurations
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Configure and manage AI model settings for your agents.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>Create Configuration</Button>
            </Box>

            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">
                            Model Configs ({pagination.total} total, showing {existingConfigs.length} on page {pagination.page + 1})
                        </Typography>
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Model</TableCell>
                                    <TableCell>Embedding</TableCell>
                                    <TableCell>Params</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {existingConfigs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">No configurations found</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    existingConfigs.map(cfg => (
                                        <TableRow key={cfg.id || cfg.name} hover>
                                            <TableCell>{cfg.name}</TableCell>
                                            <TableCell>{cfg.category || '-'}</TableCell>
                                            <TableCell>{cfg.model?.strategy || '-'}</TableCell>
                                            <TableCell>{cfg.embedding?.strategy || '-'}</TableCell>
                                            <TableCell>{Object.keys({...(cfg.model?.params || {}), ...(cfg.embedding?.params || {})}).length}</TableCell>
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
                        rowsPerPageOptions={[5, 8, 10, 15, 25]}
                        showFirstButton
                        showLastButton
                    />
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{isEditMode ? 'Edit Model Configuration' : 'Create Model Configuration'}</DialogTitle>
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
                                // If selecting from dropdown, load immediately; otherwise just update name
                                if (v && existingConfigs.some(c => c.name === v)) {
                                    loadExistingConfig(v);
                                } else {
                                    setForm(f => ({ ...f, name: v || '' }));
                                }
                            }}
                            onInputChange={(_, v) => {
                                // Only update the form name while typing, don't load config
                                setForm(f => ({ ...f, name: v }));
                            }}
                            renderInput={(params) =>
                                <TextField
                                    {...params}
                                    label="Configuration Name"
                                    placeholder="Enter a short descriptive name"
                                    size="small"
                                    required
                                    onBlur={(e) => {
                                        // Load existing config only when user stops typing (on blur)
                                        const inputValue = e.target.value;
                                        if (inputValue && existingConfigs.some(c => c.name === inputValue)) {
                                            loadExistingConfig(inputValue);
                                        }
                                    }}
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
                            <Button variant="gradientBorder" size="medium" onClick={discoverComponents}>Refresh</Button>
                        </Box>

                        {!modelIntro && form.model && (
                            <Fade in>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={16} />
                                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching model parameters…</Typography>
                                </Box>
                            </Fade>
                        )}

                        {!embeddingIntro && form.embedding && (
                            <Fade in>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={16} />
                                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Fetching embedding parameters…</Typography>
                                </Box>
                            </Fade>
                        )}

                        {modelIntro && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Model Parameters ({modelIntro.class_name})
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                                    {(modelIntro.formatted_params || []).map(paramFormatted => {
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
                                                value={form.model_params[paramName] || ''}
                                                onChange={(e) => setForm(f => ({ ...f, model_params: { ...f.model_params, [paramName]: e.target.value } }))}
                                                placeholder={placeholderText}
                                                sx={{ gridColumn }}
                                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                            />
                                        );
                                    })}
                                </Box>
                            </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Autocomplete
                                sx={{ flex: 1 }}
                                options={components.embeddings || []}
                                value={form.embedding}
                                loading={loadingDiscovery && !(components.embeddings || []).length}
                                loadingText="Loading embeddings…"
                                onChange={(_, v) => {
                                    setForm(f => ({ ...f, embedding: v || '', embedding_params: {} }));
                                    ensureIntrospection(v, 'embedding');
                                }}
                                renderInput={(params) => <TextField {...params} label="Select Embedding" />}
                            />
                        </Box>

                        {embeddingIntro && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Embedding Parameters ({embeddingIntro.class_name})
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                                    {(embeddingIntro.formatted_params || []).map(paramFormatted => {
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
                                                value={form.embedding_params[paramName] || ''}
                                                onChange={(e) => setForm(f => ({ ...f, embedding_params: { ...f.embedding_params, [paramName]: e.target.value } }))}
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
                        <Button color="error" onClick={() => deleteModelConfig(form.id, form.name)} startIcon={<DeleteIcon size={16} />}>Delete</Button>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={saveModelConfig} variant="contained" disabled={saveState.loading || !form.name || !form.model || !form.embedding}>
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Configuration' : 'Save Configuration'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default React.memo(ModelConfig);
