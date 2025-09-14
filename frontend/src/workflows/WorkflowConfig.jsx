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
    TablePagination,
    Chip
} from '@mui/material';
import { apiCall } from '../config/api';
import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon, Upload as UploadIcon, Download as DownloadIcon } from 'lucide-react';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useConfirmation } from '../contexts/ConfirmationContext';

export default function WorkflowConfig({ user }) {
    // Use the user token from props (same pattern as other dashboard components)
    const token = user?.token;

    const { showSuccess, showError, showWarning, showInfo } = useSnackbar();
    const { showDeleteConfirmation } = useConfirmation();

    // Add ref to track if component is mounted
    const isMountedRef = useRef(true);

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
        bpmn_file: null,
        bpmn_filename: ''
    });
    const [saveState, setSaveState] = useState({ loading: false });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [uploadState, setUploadState] = useState({ loading: false });

    const loadCategories = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        try {
            setLoadingCategories(true);
            const response = await apiCall(`/api/workflows/categories`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (response.ok) {
                const data = await response.json();
                if (isMountedRef.current) {
                    setCategories(data.categories || []);
                }
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        } finally {
            if (isMountedRef.current) {
                setLoadingCategories(false);
            }
        }
    }, [token]);

    const loadExistingConfigs = useCallback(async (page = 1, pageSize = 8) => {
        if (!isMountedRef.current) return;
        
        console.log('🔄 LOADING EXISTING WORKFLOW CONFIGS...');
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                page_size: pageSize.toString(),
                sort_by: 'name',
                sort_order: 'asc'
            });
            
            const resp = await apiCall(`/api/workflows/configs?${queryParams}`, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });
            console.log('📡 Load configs response:', resp.status, resp.ok);
            if (resp.ok) {
                const data = await resp.json();
                console.log('📄 Configs data:', data);
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

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (!file.name.toLowerCase().endsWith('.bpmn')) {
                showError('Please select a BPMN file (.bpmn extension)');
                return;
            }
            setForm(f => ({ 
                ...f, 
                bpmn_file: file,
                bpmn_filename: file.name
            }));
            showInfo(`BPMN file "${file.name}" selected`);
        }
    };

    const downloadBPMN = async (configId, filename) => {
        try {
            const response = await apiCall(`/api/workflows/configs/${configId}/bpmn`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'workflow.bpmn';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showSuccess('BPMN file downloaded');
            } else {
                showError('Failed to download BPMN file');
            }
        } catch (error) {
            console.error('Failed to download BPMN file:', error);
            showError('Failed to download BPMN file');
        }
    };

    // Run these functions only once on mount
    useEffect(() => {
        console.log('MOUNT: WorkflowConfig');
        loadExistingConfigs();
        loadCategories();
        
        return () => {
            console.log('UNMOUNT: WorkflowConfig');
        };
    }, [loadExistingConfigs, loadCategories]);

    // Cleanup function to handle component unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    function loadExistingConfig(configName) {
        const config = existingConfigs.find(c => c.name === configName);
        if (config) {
            setForm({
                ...config,
                id: config.id,
                name: config.name,
                category: config.category || '',
                bpmn_file: null, // Don't preload file content in form
                bpmn_filename: config.bpmn_filename || ''
            });
            setIsEditMode(true);
        } else {
            setForm({ id: null, name: configName, category: '', bpmn_file: null, bpmn_filename: '' });
            setIsEditMode(false);
        }
    }

    async function saveWorkflowConfig() {
        if (!form.name) {
            showError('Name is required');
            return;
        }

        if (!isEditMode && !form.bpmn_file) {
            showError('BPMN file is required for new workflows');
            return;
        }
        
        setSaveState(s => ({ ...s, loading: true }));
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('name', form.name);
        formData.append('category', form.category || '');
        formData.append('type', 'workflowConfig');
        
        if (form.bpmn_file) {
            formData.append('bpmn_file', form.bpmn_file);
        }
        
        try {
            let resp;
            if (isEditMode && form.id) {
                resp = await apiCall(`/api/workflows/configs/${form.id}`, {
                    method: 'PUT',
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: formData
                });
            } else {
                resp = await apiCall(`/api/workflows/configs`, {
                    method: 'POST',
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: formData
                });
            }
            
            const data = await resp.json().catch(() => ({}));
            
            if (!resp.ok) {
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
                
                showError(errorMessage);
                setSaveState({ loading: false });
                return;
            }
            
            const action = isEditMode ? 'updated' : 'saved';
            showSuccess(`Workflow configuration "${form.name}" ${action} successfully`);
            setSaveState({ loading: false });
            
            if (isMountedRef.current) {
                loadExistingConfigs();
                loadCategories();
            }
            
            setForm({ id: null, name: '', category: '', bpmn_file: null, bpmn_filename: '' });
            setIsEditMode(false);
            setDialogOpen(false);
            
        } catch (e) {
            showError(e.message || 'Network error');
            setSaveState({ loading: false });
        }
    }

    async function deleteWorkflowConfig(id, configName) {
        if (!id) return;
        
        const confirmed = await showDeleteConfirmation({
            itemName: configName || 'configuration',
            itemType: 'workflow configuration',
        });
        
        if (!confirmed) return;
        
        try {
            setSaveState({ loading: true });
            const resp = await apiCall(`/api/workflows/configs/${id}`, {
                method: 'DELETE',
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showError(data.detail || `Delete failed (HTTP ${resp.status})`);
                setSaveState({ loading: false });
                return;
            }
            showSuccess('Workflow configuration deleted');
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
        console.log('➕ OPENING CREATE WORKFLOW DIALOG');
        setForm({ id: null, name: '', category: '', bpmn_file: null, bpmn_filename: '' });
        setIsEditMode(false);
        setDialogOpen(true);
        console.log('✅ Create dialog opened');
    };

    const openEdit = (configName) => {
        console.log('✏️ OPENING EDIT WORKFLOW DIALOG for:', configName);
        loadExistingConfig(configName);
        setDialogOpen(true);
        console.log('✅ Edit dialog opened');
    };

    return (
        <Box>
            {(loadingConfigs || saveState.loading) && (
                <Fade in timeout={400}>
                    <Box sx={{ mb: 2, height: 4, borderRadius: '4px', bgcolor: 'action.hover' }} />
                </Fade>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Workflow Configurations
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Configure and manage BPMN workflows for your automation processes.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon size={18} />} onClick={openCreate}>Create Configuration</Button>
            </Box>

            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">
                            Workflow Configs ({pagination.total} total, showing {existingConfigs.length} on page {pagination.page + 1})
                        </Typography>
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>BPMN File</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {existingConfigs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">No workflow configurations found</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    existingConfigs.map(cfg => (
                                        <TableRow key={cfg.id || cfg.name} hover>
                                            <TableCell>{cfg.name}</TableCell>
                                            <TableCell>
                                                {cfg.category ? (
                                                    <Chip label={cfg.category} size="small" variant="outlined" />
                                                ) : (
                                                    '-'
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {cfg.bpmn_filename ? (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {cfg.bpmn_filename}
                                                        </Typography>
                                                        <IconButton size="small" onClick={() => downloadBPMN(cfg.id, cfg.bpmn_filename)}>
                                                            <DownloadIcon size={14} />
                                                        </IconButton>
                                                    </Box>
                                                ) : (
                                                    '-'
                                                )}
                                            </TableCell>
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
                <DialogTitle>{isEditMode ? 'Edit Workflow Configuration' : 'Create Workflow Configuration'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={3}>
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

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 2 }}>
                                BPMN File Upload
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    startIcon={<UploadIcon size={18} />}
                                    disabled={saveState.loading}
                                >
                                    {isEditMode ? 'Replace BPMN File' : 'Upload BPMN File'}
                                    <input
                                        type="file"
                                        hidden
                                        accept=".bpmn"
                                        onChange={handleFileUpload}
                                    />
                                </Button>
                                {form.bpmn_filename && (
                                    <Chip 
                                        label={form.bpmn_filename} 
                                        variant="outlined" 
                                        color="primary"
                                        size="small"
                                    />
                                )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                {isEditMode 
                                    ? 'Upload a new BPMN file to replace the existing one, or leave empty to keep current file.'
                                    : 'Upload a BPMN file (.bpmn extension) for this workflow configuration.'
                                }
                            </Typography>
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    {isEditMode && form.id && (
                        <Button color="error" onClick={() => deleteWorkflowConfig(form.id, form.name)} startIcon={<DeleteIcon size={16} />}>Delete</Button>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={saveWorkflowConfig} 
                        variant="contained" 
                        disabled={saveState.loading || !form.name || (!isEditMode && !form.bpmn_file)}
                    >
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Configuration' : 'Save Configuration'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
