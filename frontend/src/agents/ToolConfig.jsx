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

function ToolConfig({ user }) {
    const token = user?.token;
    const { showSuccess, showError, showWarning } = useSnackbar();
    const { showDeleteConfirmation } = useConfirmation();
    
    // Add ref to track if component is mounted and prevent duplicate calls
    const isMountedRef = useRef(true);
    const isLoadingConfigsRef = useRef(false);
    const isLoadingCategoriesRef = useRef(false);
    const isLoadingDiscoveryRef = useRef(false);

    // Store token ref to avoid useCallback dependency issues
    const tokenRef = useRef(token);
    tokenRef.current = token;

    const [components, setComponents] = useState({ functions: [] });
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
        tool: '',
        tool_params: {}
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // Form validation errors
    const [errors, setErrors] = useState({
        name: '',
        tool: '',
        tool_params: {}
    });

    const discoverComponents = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        // Prevent duplicate calls
        if (isLoadingDiscoveryRef.current) {
            return;
        }
        
        try {
            isLoadingDiscoveryRef.current = true;
            setLoadingDiscovery(true);
            
            const result = await sharedApiService.makeRequest(
                '/api/tools/components?folder=ai.functions',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { 
                    folder: 'ai.functions',
                    token: tokenRef.current?.substring(0, 10)
                }
            );
            
            if (!isMountedRef.current) {
                return;
            }
            
            if (result.success) {
                const comps = result.data?.components || {};
                setComponents({ functions: comps['ai.functions'] || [] });
            } else {
                if (isMountedRef.current) {
                    showError('Failed to discover tools');
                }
            }
        } catch (error) {
            console.error('Failed to discover tools:', error);
            if (isMountedRef.current) {
                showError('Failed to discover tools');
            }
        } finally {
            if (isMountedRef.current) {
                isLoadingDiscoveryRef.current = false;
                setLoadingDiscovery(false);
            }
        }
    }, []); // Empty dependencies

    const introspectTool = async (modulePath, kind = 'tool') => {
        if (!modulePath || introspectCache[modulePath] || pendingIntros[modulePath]) return;
        try {
            setPendingIntros(p => ({ ...p, [modulePath]: true }));
            const response = await apiCall(`/api/tools/introspect`, {
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
                '/api/tools/categories',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );
            
            if (!isMountedRef.current) {
                return;
            }
            
            if (result.success) {
                setCategories(result.data.categories || []);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        } finally {
            if (isMountedRef.current) {
                isLoadingCategoriesRef.current = false;
                setLoadingCategories(false);
            }
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
                `/api/tools/configs?${queryParams}`,
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
            
            if (!isMountedRef.current) {
                return;
            }
            
            if (result.success) {
                const data = result.data;
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
        } catch (e) {
            console.error('Failed to load existing configurations:', e);
        } finally {
            if (isMountedRef.current) {
                isLoadingConfigsRef.current = false;
                setLoadingConfigs(false);
            }
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

    useEffect(() => {
        if (!loadingDiscovery && components.functions.length === 0) {
            showWarning('No tools discovered. Check backend logs or refresh.');
        }
    }, [loadingDiscovery, components.functions]); // Remove showWarning - it's unstable

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
                console.error('❌ TOOLCONFIG Error during initialization:', err);
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
            tool: '',
            tool_params: {}
        }

        // Validate name
        if (!form.name || form.name.trim() === '') {
            newErrors.name = 'Configuration name is required'
        }

        // Validate tool selection
        if (!form.tool) {
            newErrors.tool = 'Tool selection is required'
        }

        // Validate required tool parameters (those without defaults)
        const toolIntro = form.tool ? introspectCache[form.tool] : null
        if (toolIntro && toolIntro.formatted_params) {
            toolIntro.formatted_params.forEach(paramFormatted => {
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
                if (!hasDefault && (!form.tool_params[paramName] || form.tool_params[paramName].toString().trim() === '')) {
                    newErrors.tool_params[paramName] = `${paramName} is required`
                }
            })
        }

        setErrors(newErrors)
        
        // Return true if no errors
        const hasToolParamErrors = Object.keys(newErrors.tool_params).length > 0
        return !newErrors.name && !newErrors.tool && !hasToolParamErrors
    }

    const resetErrors = () => {
        setErrors({
            name: '',
            tool: '',
            tool_params: {}
        })
    }

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
                tool: config.tool?.strategy || '',
                tool_params: config.tool?.params || {}
            });
            setIsEditMode(true);
            if (config.tool?.strategy) {
                ensureIntrospection(config.tool.strategy, 'tool');
            }
        } else {
            setForm({ id: null, name: configName, category: '', tool: '', tool_params: {} });
            setIsEditMode(false);
        }
    }

    async function saveToolConfig() {
        // Validate form before saving
        if (!validateForm()) {
            return
        }
        setSaveState(s => ({ ...s, loading: true }));
        const configToSave = {
            name: form.name,
            category: form.category || '',
            tool: {
                strategy: form.tool,
                params: form.tool_params
            },
            type: 'toolConfig'
        };
        try {
            let resp;
            if (isEditMode && form.id) {
                resp = await apiCall(`/api/tools/configs/${form.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify(configToSave)
                });
            } else {
                resp = await apiCall(`/api/tools/configs`, {
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
            
            // Invalidate cache after successful save
            sharedApiService.invalidateCache('/api/tools/configs');
            sharedApiService.invalidateCache('/api/tools/categories');
            sharedApiService.invalidateCache('/api/tools/components');
            
            if (isMountedRef.current) {
                loadExistingConfigs();
                loadCategories();
            }
            setForm({ id: null, name: '', category: '', tool: '', tool_params: {} });
            setIsEditMode(false);
            setDialogOpen(false);
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    async function deleteToolConfig(id, configName) {
        if (!id) return;
        
        const confirmed = await showDeleteConfirmation({
            itemName: configName || 'configuration',
            itemType: 'tool configuration',
        });
        
        if (!confirmed) return;
        
        try {
            setSaveState({ loading: true });
            const resp = await apiCall(`/api/tools/configs/${id}`, {
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
            
            // Invalidate cache after successful delete
            sharedApiService.invalidateCache('/api/tools/configs');
            sharedApiService.invalidateCache('/api/tools/categories');
            sharedApiService.invalidateCache('/api/tools/components');
            
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
        setForm({ id: null, name: '', category: '', tool: '', tool_params: {} });
        setIsEditMode(false);
        resetErrors();
        setDialogOpen(true);
    };

    const openEdit = (name) => {
        loadExistingConfig(name);
        resetErrors();
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
                        Tools
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
                        <Typography variant="h6">
                            Tool Configs ({pagination.total} total, showing {existingConfigs.length} on page {pagination.page + 1})
                        </Typography>
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
                                            <TableCell>{cfg.tool?.strategy || '-'}</TableCell>
                                            <TableCell>{Object.keys(cfg.tool?.params || {}).length}</TableCell>
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
                                options={components.functions || []}
                                value={form.tool}
                                loading={loadingDiscovery && !(components.functions || []).length}
                                loadingText="Loading tools…"
                                onChange={(_, v) => {
                                    // Clear error when user changes the field
                                    if (errors.tool) {
                                        setErrors(prev => ({ ...prev, tool: '' }));
                                    }
                                    setForm(f => ({ ...f, tool: v || '', tool_params: {} }));
                                    ensureIntrospection(v, 'tool');
                                }}
                                renderInput={(params) => 
                                    <TextField 
                                        {...params} 
                                        label="Select Tool" 
                                        required
                                        error={!!errors.tool}
                                        helperText={errors.tool}
                                    />
                                }
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
                                                onChange={(e) => {
                                                    // Clear error when user types
                                                    if (errors.tool_params[paramName]) {
                                                        setErrors(prev => ({
                                                            ...prev,
                                                            tool_params: { ...prev.tool_params, [paramName]: '' }
                                                        }));
                                                    }
                                                    setForm(f => ({ ...f, tool_params: { ...f.tool_params, [paramName]: e.target.value } }));
                                                }}
                                                placeholder={placeholderText}
                                                sx={{ gridColumn }}
                                                type={paramType.includes('int') || paramType.includes('float') ? 'number' : 'text'}
                                                required={!hasDefault}
                                                error={!!errors.tool_params[paramName]}
                                                helperText={errors.tool_params[paramName]}
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
                        <Button color="error" onClick={() => deleteToolConfig(form.id, form.name)} startIcon={<DeleteIcon size={16} />}>Delete</Button>
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
                    <Button onClick={saveToolConfig} variant="contained" disabled={saveState.loading || !form.name || !form.tool}>
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Configuration' : 'Save Configuration'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default React.memo(ToolConfig);
