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
import sharedApiService from '../utils/apiService';
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from 'lucide-react';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useConfirmation } from '../contexts/ConfirmationContext';

function ModelConfig({ user }) {
    // Use the user token from props (same pattern as other dashboard components)
    const token = user?.token;

    const { showSuccess, showError, showWarning, showInfo } = useSnackbar();
    const { showDeleteConfirmation } = useConfirmation();

    // Add ref to track if component is mounted and prevent duplicate calls
    const isMountedRef = useRef(true);
    const isLoadingConfigsRef = useRef(false);
    const isLoadingCategoriesRef = useRef(false);
    const isLoadingDiscoveryRef = useRef(false);

    // Store token ref to avoid useCallback dependency issues
    const tokenRef = useRef(token);
    tokenRef.current = token;
    

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

    // Form validation errors
    const [errors, setErrors] = useState({
        name: '',
        model: '',
        model_params: {},
        embedding_params: {}
    });

    // Discover components using HTTP
    const discoverComponents = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        // Prevent duplicate calls
        if (isLoadingDiscoveryRef.current) {
            return;
        }
        
        try {
            isLoadingDiscoveryRef.current = true;
            setLoadingDiscovery(true);
            
            // Use singleton service for both model and embedding discovery
            const [modelsResult, embeddingsResult] = await Promise.all([
                sharedApiService.makeRequest(
                    '/api/models/components?folder=ai.models',
                    {
                        headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                    },
                    { 
                        folder: 'ai.models',
                        token: tokenRef.current?.substring(0, 10)
                    }
                ),
                sharedApiService.makeRequest(
                    '/api/models/components?folder=ai.embeddings',
                    {
                        headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                    },
                    { 
                        folder: 'ai.embeddings',
                        token: tokenRef.current?.substring(0, 10)
                    }
                )
            ]);

            if (!isMountedRef.current) {
                return;
            }

            let models = [];
            let embeddings = [];

            if (modelsResult.success) {
                const comps = modelsResult.data?.components || {};
                models = comps['ai.models'] || [];
            } else {
                if (isMountedRef.current) {
                    showError('Failed to discover models');
                }
            }

            if (embeddingsResult.success) {
                const comps = embeddingsResult.data?.components || {};
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
                isLoadingDiscoveryRef.current = false;
                setLoadingDiscovery(false);
            }
        }
    }, []); // Empty dependencies

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
        
        // Prevent duplicate calls
        if (isLoadingCategoriesRef.current) {
            return;
        }
        try {
            isLoadingCategoriesRef.current = true;
            setLoadingCategories(true);
            
            const result = await sharedApiService.makeRequest(
                '/api/models/categories',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );
            
            // removed categories response log
            
            if (!isMountedRef.current) {
                return;
            }
            
            if (result.success) {
                // removed categories data log
                setCategories(result.data.categories || []);
                // removed success log
            } else {
                // removed failure log
            }
        } catch (error) {
            // removed error detail log
            console.error('Failed to load categories:', error);
        } finally {
            if (isMountedRef.current) {
                isLoadingCategoriesRef.current = false;
                setLoadingCategories(false);
            }
            // removed finished log
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
            setLoadingConfigs(true);
            
            const queryParams = new URLSearchParams({
                page: page.toString(),
                page_size: pageSize.toString(),
                sort_by: 'name',
                sort_order: 'asc'
            });
            
            const result = await sharedApiService.makeRequest(
                `/api/models/configs?${queryParams}`,
                {
                    headers: {
                        ...(tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {})
                    }
                },
                { 
                    page, 
                    pageSize, 
                    token: tokenRef.current?.substring(0, 10) 
                }
            );
            
            // removed load configs response log
            
            if (!isMountedRef.current) {
                return;
            }
            
            if (result.success) {
                const data = result.data;
                // removed configs data logs
                
                setExistingConfigs(data.configurations || []);
                if (data.pagination) {
                    setPagination({
                        page: data.pagination.page - 1, // Convert to 0-based for MUI
                        rowsPerPage: data.pagination.page_size,
                        total: data.pagination.total,
                        totalPages: data.pagination.total_pages
                    });
                }
                // removed success log
            } else {
                // removed failure log
            }
        } catch (e) {
            // removed error log
            console.error('Failed to load existing configurations:', e);
        } finally {
            if (isMountedRef.current) {
                isLoadingConfigsRef.current = false;
                setLoadingConfigs(false);
            }
            // removed finished log
        }
    }, []); // Empty dependencies

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

    // Use exact same pattern as other components
    useEffect(() => {
        const loadData = async () => {
            // removed mount log
            if (!isMountedRef.current) return;
            
            // Set mounted to true
            isMountedRef.current = true;
            
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
        
        return () => {
            // removed unmount log
            // Set mounted to false FIRST to prevent any state updates
            isMountedRef.current = false;
            isLoadingConfigsRef.current = false;
            isLoadingCategoriesRef.current = false;
            isLoadingDiscoveryRef.current = false;
        };
    }, []); // EMPTY DEPENDENCIES - NO BULLSHIT

    const validateForm = () => {
        const newErrors = {
            name: '',
            model: '',
            model_params: {},
            embedding_params: {}
        }

        // Validate name
        if (!form.name || form.name.trim() === '') {
            newErrors.name = 'Configuration name is required'
        }

        // Validate model selection
        if (!form.model) {
            newErrors.model = 'Model selection is required'
        }

        // Validate required model parameters (those without defaults)
        const modelIntro = form.model ? introspectCache[form.model] : null
        if (modelIntro && modelIntro.formatted_params) {
            modelIntro.formatted_params.forEach(paramFormatted => {
                const paramName = paramFormatted.split(':')[0].trim()
                const descSplitIdx = paramFormatted.indexOf(' - ')
                const mainPart = descSplitIdx !== -1 ? paramFormatted.slice(0, descSplitIdx) : paramFormatted
                const eqIdx = mainPart.indexOf('=')
                let defaultRaw = ''
                if (eqIdx !== -1) {
                    defaultRaw = mainPart.slice(eqIdx + 1).trim()
                }
                const hasDefault = defaultRaw !== '' && defaultRaw.toLowerCase() !== 'none'
                
                // If parameter has no default and no value provided, it's required
                if (!hasDefault && (!form.model_params[paramName] || form.model_params[paramName].toString().trim() === '')) {
                    newErrors.model_params[paramName] = `${paramName} is required`
                }
            })
        }

        // Validate required embedding parameters (those without defaults)
        const embeddingIntro = form.embedding ? introspectCache[form.embedding] : null
        if (embeddingIntro && embeddingIntro.formatted_params) {
            embeddingIntro.formatted_params.forEach(paramFormatted => {
                const paramName = paramFormatted.split(':')[0].trim()
                const descSplitIdx = paramFormatted.indexOf(' - ')
                const mainPart = descSplitIdx !== -1 ? paramFormatted.slice(0, descSplitIdx) : paramFormatted
                const eqIdx = mainPart.indexOf('=')
                let defaultRaw = ''
                if (eqIdx !== -1) {
                    defaultRaw = mainPart.slice(eqIdx + 1).trim()
                }
                const hasDefault = defaultRaw !== '' && defaultRaw.toLowerCase() !== 'none'
                
                // If parameter has no default and no value provided, it's required
                if (!hasDefault && (!form.embedding_params[paramName] || form.embedding_params[paramName].toString().trim() === '')) {
                    newErrors.embedding_params[paramName] = `${paramName} is required`
                }
            })
        }

        setErrors(newErrors)
        
        // Return true if no errors
        const hasModelParamErrors = Object.keys(newErrors.model_params).length > 0
        const hasEmbeddingParamErrors = Object.keys(newErrors.embedding_params).length > 0
        return !newErrors.name && !newErrors.model && !hasModelParamErrors && !hasEmbeddingParamErrors
    }

    const resetErrors = () => {
        setErrors({
            name: '',
            model: '',
            model_params: {},
            embedding_params: {}
        })
    }

    function ensureIntrospection(path, kind) {
        if (!path || introspectCache[path]) return;
        introspectModel(path, kind);
    }

    function loadExistingConfig(configName) {
    const config = existingConfigs.find(c => c.name === configName);
        if (config) {
            // removed config found log
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
            // removed form edit mode log
        } else {
            // removed not found log
            setForm({ id: null, name: configName, category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
            setIsEditMode(false);
            // removed create mode log
        }
    }

    async function saveModelConfig() {
    // removed save start debug logs
        
        // Validate form before saving
        if (!validateForm()) {
            return
        }
        
    // removed validation passed log
        setSaveState(s => ({ ...s, loading: true }));
    // removed save state log
        
        const configToSave = {
            name: form.name,
            category: form.category || '',
            model: {
                strategy: form.model,
                params: form.model_params
            },
            ...(form.embedding ? {
                embedding: {
                    strategy: form.embedding,
                    params: form.embedding_params
                }
            } : {}),
            type: 'modelConfig'
        };
    // removed config to save log
        
        try {
            // removed starting api call log
            let resp;
            if (isEditMode && form.id) {
                // removed update mode log
                resp = await apiCall(`/api/models/configs/${form.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            } else {
                // removed create mode log
                resp = await apiCall(`/api/models/configs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            }
            // removed api response received log
            
            const data = await resp.json().catch(() => ({}));
            // removed response data logs
            
            if (!resp.ok) {
                // removed api error log
                
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
                
                // removed formatted error message log
                showError(errorMessage);
                setSaveState({ loading: false });
                // removed save state reset log
                return;
            }
            
            const action = isEditMode ? 'updated' : 'saved';
            // removed success action log
            showSuccess(`Model configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            // removed save state reset log
            
            // Invalidate cache after successful save
            sharedApiService.invalidateCache('/api/models/configs');
            sharedApiService.invalidateCache('/api/models/categories');
            sharedApiService.invalidateCache('/api/models/components');
            
            // removed reloading log
            if (isMountedRef.current) {
                loadExistingConfigs();
                loadCategories();
            }
            
            // removed resetting form log
            setForm({ id: null, name: '', category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
            setIsEditMode(false);
            setDialogOpen(false);
            // removed save completed log
            
        } catch (e) {
            // removed catch block error log
            console.error('Full error object:', e);
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
            // removed save state reset error log
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
            
            // Invalidate cache after successful delete
            sharedApiService.invalidateCache('/api/models/configs');
            sharedApiService.invalidateCache('/api/models/categories');
            sharedApiService.invalidateCache('/api/models/components');
            
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
    // removed opening create dialog log
        setForm({ id: null, name: '', category: '', model: '', model_params: {}, embedding: '', embedding_params: {} });
        setIsEditMode(false);
        resetErrors();
        setDialogOpen(true);
    // removed create dialog opened log
    };

    const openEdit = (configName) => {
    // removed opening edit dialog log
        loadExistingConfig(configName);
        resetErrors();
        setDialogOpen(true);
    // removed edit dialog opened log
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
                        Models
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

            <Dialog 
                open={dialogOpen} 
                onClose={() => {
                    setDialogOpen(false);
                    resetErrors();
                }} 
                maxWidth="md" 
                fullWidth
            >
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
                                // Clear error when user changes the field
                                if (errors.name) {
                                    setErrors(prev => ({ ...prev, name: '' }));
                                }
                                // If selecting from dropdown, load immediately; otherwise just update name
                                if (v && existingConfigs.some(c => c.name === v)) {
                                    loadExistingConfig(v);
                                } else {
                                    setForm(f => ({ ...f, name: v || '' }));
                                }
                            }}
                            onInputChange={(_, v) => {
                                // Clear error when user types
                                if (errors.name) {
                                    setErrors(prev => ({ ...prev, name: '' }));
                                }
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
                                    error={!!errors.name}
                                    helperText={errors.name}
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
                                    // Clear error when user changes the field
                                    if (errors.model) {
                                        setErrors(prev => ({ ...prev, model: '' }));
                                    }
                                    setForm(f => ({ ...f, model: v || '', model_params: {} }));
                                    ensureIntrospection(v, 'model');
                                }}
                                renderInput={(params) => 
                                    <TextField 
                                        {...params} 
                                        label="Select Model" 
                                        required
                                        error={!!errors.model}
                                        helperText={errors.model}
                                    />
                                }
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
                                                onChange={(e) => {
                                                    // Clear error when user types
                                                    if (errors.model_params[paramName]) {
                                                        setErrors(prev => ({
                                                            ...prev,
                                                            model_params: { ...prev.model_params, [paramName]: '' }
                                                        }));
                                                    }
                                                    setForm(f => ({ ...f, model_params: { ...f.model_params, [paramName]: e.target.value } }));
                                                }}
                                                placeholder={placeholderText}
                                                sx={{ gridColumn }}
                                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                                required={!hasDefault}
                                                error={!!errors.model_params[paramName]}
                                                helperText={errors.model_params[paramName]}
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
                                                onChange={(e) => {
                                                    // Clear error when user types
                                                    if (errors.embedding_params[paramName]) {
                                                        setErrors(prev => ({
                                                            ...prev,
                                                            embedding_params: { ...prev.embedding_params, [paramName]: '' }
                                                        }));
                                                    }
                                                    setForm(f => ({ ...f, embedding_params: { ...f.embedding_params, [paramName]: e.target.value } }));
                                                }}
                                                placeholder={placeholderText}
                                                sx={{ gridColumn }}
                                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                                required={!hasDefault}
                                                error={!!errors.embedding_params[paramName]}
                                                helperText={errors.embedding_params[paramName]}
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
                    <Button 
                        onClick={() => {
                            setDialogOpen(false);
                            resetErrors();
                        }}
                    >
                        Cancel
                    </Button>
                    <Button onClick={saveModelConfig} variant="contained" disabled={saveState.loading || !form.name || !form.model}>
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Configuration' : 'Save Configuration'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default React.memo(ModelConfig);
