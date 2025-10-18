import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Autocomplete,
    Stack,
    Typography,
    Box,
    Chip
} from '@mui/material';
import { apiCall } from '../../config/api';
import sharedApiService from '../../utils/apiService';
import { Save as SaveIcon } from 'lucide-react';

const WorkflowConfigDialog = ({ open, onClose, bpmnFile, user }) => {
    const token = user?.token;
    const tokenRef = useRef(token);
    tokenRef.current = token;

    const [form, setForm] = useState({
        name: '',
        category: '',
    });
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [saving, setSaving] = useState(false);
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(false);

    // Load categories
    useEffect(() => {
        if (open) {
            loadCategories();
            loadExistingConfigs();
        }
    }, [open]);

    const loadCategories = async () => {
        try {
            setLoadingCategories(true);
            const result = await sharedApiService.makeRequest(
                '/api/workflows/categories',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );
            
            if (result.success) {
                setCategories(result.data.categories || []);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        } finally {
            setLoadingCategories(false);
        }
    };

    const loadExistingConfigs = async () => {
        try {
            setLoadingConfigs(true);
            const result = await sharedApiService.makeRequest(
                '/api/workflows/configs/all',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );
            
            if (result.success) {
                setExistingConfigs(result.data.configurations || []);
            }
        } catch (error) {
            console.error('Failed to load configs:', error);
        } finally {
            setLoadingConfigs(false);
        }
    };

    const handleSave = async () => {
        if (!form.name) {
            alert('Name is required');
            return;
        }

        if (!bpmnFile) {
            alert('BPMN file is required');
            return;
        }

        setSaving(true);

        // Create FormData for file upload
        const formData = new FormData();
        formData.append('name', form.name);
        formData.append('category', form.category || '');
        formData.append('type', 'workflowConfig');
        formData.append('bpmn_file', bpmnFile);

        try {
            const resp = await apiCall('/api/workflows/configs', {
                method: 'POST',
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: formData
            });

            const data = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                let errorMessage = `Save failed (HTTP ${resp.status})`;
                if (data.detail) {
                    if (Array.isArray(data.detail)) {
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
                alert(errorMessage);
                setSaving(false);
                return;
            }

            alert(`Workflow configuration "${form.name}" saved successfully`);

            // Invalidate cache
            sharedApiService.invalidateCache('/api/workflows/configs');
            sharedApiService.invalidateCache('/api/workflows/categories');

            // Reset and close
            setForm({ name: '', category: '' });
            setSaving(false);
            onClose(true); // Pass true to indicate successful save

        } catch (e) {
            alert(e.message || 'Network error');
            setSaving(false);
        }
    };

    const handleClose = () => {
        if (!saving) {
            setForm({ name: '', category: '' });
            onClose(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Save New Workflow</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    <Typography variant="body2" color="text.secondary">
                        Save this BPMN diagram as a new workflow configuration.
                    </Typography>

                    <Autocomplete
                        freeSolo
                        fullWidth
                        options={existingConfigs.map(c => c.name)}
                        value={form.name}
                        loading={loadingConfigs}
                        disabled={saving}
                        onChange={(_, v) => setForm(f => ({ ...f, name: v || '' }))}
                        onInputChange={(_, v) => setForm(f => ({ ...f, name: v || '' }))}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Workflow Name"
                                placeholder="Enter a unique workflow name"
                                size="small"
                                required
                            />
                        )}
                    />

                    <Autocomplete
                        freeSolo
                        fullWidth
                        size="small"
                        options={categories}
                        value={form.category}
                        loading={loadingCategories}
                        disabled={saving}
                        onChange={(e, val) => {
                            setForm(f => ({ ...f, category: val || '' }));
                            if (val && !categories.includes(val)) setCategories(prev => [...prev, val]);
                        }}
                        onInputChange={(e, val) => {
                            setForm(f => ({ ...f, category: val || '' }));
                            if (val && !categories.includes(val)) setCategories(prev => [...prev, val]);
                        }}
                        renderInput={(params) => (
                            <TextField {...params} label="Category" placeholder="Enter or select a category" size="small" />
                        )}
                    />

                    {bpmnFile && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                BPMN File:
                            </Typography>
                            <Chip 
                                label={bpmnFile.name} 
                                variant="outlined" 
                                color="primary"
                                size="small"
                                sx={{ alignSelf: 'flex-start' }}
                            />
                        </Box>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={saving}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSave} 
                    variant="contained" 
                    disabled={saving || !form.name || !bpmnFile}
                    startIcon={<SaveIcon size={16} />}
                >
                    {saving ? 'Saving...' : 'Save Workflow'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default WorkflowConfigDialog;
