import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
    Box,
    Button,
    TextField,
    Typography,
    Autocomplete,
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
    Chip,
    MenuItem,
    FormControl,
    InputLabel,
    Select,
    Grid
} from '@mui/material';
import { 
    Plus as AddIcon, 
    Pencil as EditIcon, 
    Trash2 as DeleteIcon, 
    Play as PlayIcon,
    Pause as PauseIcon,
    RefreshCw as ResumeIcon,
    Clock as ClockIcon
} from 'lucide-react';
import { apiCall } from '../config/api';
import sharedApiService from '../utils/apiService';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useConfirmation } from '../contexts/ConfirmationContext';

function SchedulerJobs({ user }) {
    const token = user?.token;
    const { showSuccess, showError, showWarning, showInfo } = useSnackbar();
    const { showDeleteConfirmation } = useConfirmation();

    // Refs - EXACT PATTERN FROM ModelConfig
    const isMountedRef = useRef(true);
    const isLoadingJobsRef = useRef(false);
    const isLoadingStatusRef = useRef(false);
    const tokenRef = useRef(token);
    tokenRef.current = token;

    // State
    const [jobs, setJobs] = useState([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [saveState, setSaveState] = useState({ loading: false });
    const [schedulerStatus, setSchedulerStatus] = useState(null);
    
    const [form, setForm] = useState({
        id: '',
        name: '',
        func: '',
        trigger_type: 'interval',
        trigger: {
            minutes: 5
        },
        args: [],
        kwargs: {},
        replace_existing: false,
        max_instances: 1
    });

    // Trigger type options
    const triggerTypes = [
        { value: 'interval', label: 'Interval' },
        { value: 'cron', label: 'Cron' },
        { value: 'date', label: 'Date (One-time)' }
    ];

    const resetForm = () => {
        setForm({
            id: '',
            name: '',
            func: '',
            trigger_type: 'interval',
            trigger: {
                minutes: 5
            },
            args: [],
            kwargs: {},
            replace_existing: false,
            max_instances: 1
        });
        setIsEditMode(false);
    };

    const loadJobs = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        // Prevent duplicate calls
        if (isLoadingJobsRef.current) {
            return;
        }

        try {
            isLoadingJobsRef.current = true;
            setLoadingJobs(true);
            
            const result = await sharedApiService.makeRequest(
                '/api/scheduler/jobs',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );

            if (!isMountedRef.current) return;

            if (result.success) {
                setJobs(result.data.jobs || []);
            } else {
                showError(result.error || 'Failed to load jobs');
            }
        } catch (error) {
            if (isMountedRef.current) {
                console.error('Failed to load jobs:', error);
                showError('Failed to load jobs');
            }
        } finally {
            if (isMountedRef.current) {
                isLoadingJobsRef.current = false;
                setLoadingJobs(false);
            }
        }
    }, []); // Empty dependencies

    const loadSchedulerStatus = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        // Prevent duplicate calls
        if (isLoadingStatusRef.current) {
            return;
        }

        try {
            isLoadingStatusRef.current = true;
            
            const result = await sharedApiService.makeRequest(
                '/api/scheduler/status',
                {
                    headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
                },
                { token: tokenRef.current?.substring(0, 10) }
            );

            if (!isMountedRef.current) return;

            if (result.success) {
                setSchedulerStatus(result.data);
            }
        } catch (error) {
            if (isMountedRef.current) {
                console.error('Failed to load scheduler status:', error);
            }
        } finally {
            if (isMountedRef.current) {
                isLoadingStatusRef.current = false;
            }
        }
    }, []); // Empty dependencies

    // Use exact same pattern as ModelConfig
    useEffect(() => {
        const loadData = async () => {
            if (!isMountedRef.current) return;
            
            // Set mounted to true
            isMountedRef.current = true;
            
            try {
                // Load jobs and status
                await Promise.all([
                    loadJobs(),
                    loadSchedulerStatus()
                ]);
                
            } catch (err) {
                console.error('❌ SCHEDULERJOBS Error during initialization:', err);
            }
        };
        
        loadData();
        
        return () => {
            // Set mounted to false FIRST to prevent any state updates
            isMountedRef.current = false;
            isLoadingJobsRef.current = false;
            isLoadingStatusRef.current = false;
        };
    }, []); // EMPTY DEPENDENCIES - NO BULLSHIT

    const openCreateDialog = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEditDialog = (job) => {
        setForm({
            id: job.id,
            name: job.name,
            func: job.func,
            trigger_type: 'interval', // Simplified for now
            trigger: {
                minutes: 5 // Default
            },
            args: job.args || [],
            kwargs: job.kwargs || {},
            replace_existing: true
        });
        setIsEditMode(true);
        setDialogOpen(true);
    };

    const saveJob = async () => {
        if (!form.id || !form.name || !form.func) {
            showError('Job ID, Name, and Function are required');
            return;
        }

        setSaveState({ loading: true });

        try {
            const payload = {
                id: form.id,
                name: form.name,
                func: form.func,
                trigger_type: form.trigger_type,
                trigger: form.trigger,
                args: form.args,
                kwargs: form.kwargs,
                replace_existing: form.replace_existing,
                max_instances: form.max_instances
            };

            const endpoint = isEditMode ? `/api/scheduler/jobs/${form.id}` : '/api/scheduler/jobs';
            const method = isEditMode ? 'PUT' : 'POST';

            const response = await apiCall(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {})
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                showSuccess(data.message || `Job ${isEditMode ? 'updated' : 'created'} successfully`);
                setDialogOpen(false);
                resetForm();
                await loadJobs();
            } else {
                showError(data.detail || `Failed to ${isEditMode ? 'update' : 'create'} job`);
            }
        } catch (error) {
            console.error('Failed to save job:', error);
            showError('Failed to save job');
        } finally {
            setSaveState({ loading: false });
        }
    };

    const deleteJob = async (jobId, jobName) => {
        const confirmed = await showDeleteConfirmation({
            itemName: jobName,
            itemType: 'job',
        });

        if (!confirmed) return;

        try {
            const response = await apiCall(`/api/scheduler/jobs/${jobId}`, {
                method: 'DELETE',
                headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
            });

            const data = await response.json();

            if (response.ok) {
                showSuccess(data.message || 'Job deleted successfully');
                await loadJobs();
            } else {
                showError(data.detail || 'Failed to delete job');
            }
        } catch (error) {
            console.error('Failed to delete job:', error);
            showError('Failed to delete job');
        }
    };

    const pauseJob = async (jobId) => {
        try {
            const response = await apiCall(`/api/scheduler/jobs/${jobId}/pause`, {
                method: 'POST',
                headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
            });

            const data = await response.json();

            if (response.ok) {
                showSuccess(data.message || 'Job paused successfully');
                await loadJobs();
            } else {
                showError(data.detail || 'Failed to pause job');
            }
        } catch (error) {
            console.error('Failed to pause job:', error);
            showError('Failed to pause job');
        }
    };

    const resumeJob = async (jobId) => {
        try {
            const response = await apiCall(`/api/scheduler/jobs/${jobId}/resume`, {
                method: 'POST',
                headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
            });

            const data = await response.json();

            if (response.ok) {
                showSuccess(data.message || 'Job resumed successfully');
                await loadJobs();
            } else {
                showError(data.detail || 'Failed to resume job');
            }
        } catch (error) {
            console.error('Failed to resume job:', error);
            showError('Failed to resume job');
        }
    };

    const runJobNow = async (jobId) => {
        try {
            const response = await apiCall(`/api/scheduler/jobs/${jobId}/run`, {
                method: 'POST',
                headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
            });

            const data = await response.json();

            if (response.ok) {
                showSuccess(data.message || 'Job triggered successfully');
                await loadJobs();
            } else {
                showError(data.detail || 'Failed to trigger job');
            }
        } catch (error) {
            console.error('Failed to trigger job:', error);
            showError('Failed to trigger job');
        }
    };

    const formatNextRunTime = (nextRunTime) => {
        if (!nextRunTime) return 'Not scheduled';
        try {
            const date = new Date(nextRunTime);
            return date.toLocaleString();
        } catch {
            return nextRunTime;
        }
    };

    return (
        <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Scheduler Jobs
                    </Typography>
                    {schedulerStatus && (
                        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                            <Chip 
                                label={schedulerStatus.running ? 'Running' : 'Stopped'} 
                                color={schedulerStatus.running ? 'success' : 'error'}
                                size="small"
                            />
                            <Chip 
                                label={`${schedulerStatus.total_jobs} Total Jobs`} 
                                size="small"
                                variant="outlined"
                            />
                            <Chip 
                                label={`${schedulerStatus.pending_jobs} Pending`} 
                                size="small"
                                variant="outlined"
                                color="primary"
                            />
                        </Box>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="outlined"
                        onClick={loadJobs}
                        disabled={loadingJobs}
                    >
                        {loadingJobs ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon size={18} />}
                        onClick={openCreateDialog}
                    >
                        Add Job
                    </Button>
                </Box>
            </Stack>

            {/* Jobs Table */}
            <Card>
                <CardContent>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Job ID</strong></TableCell>
                                    <TableCell><strong>Name</strong></TableCell>
                                    <TableCell><strong>Function</strong></TableCell>
                                    <TableCell><strong>Trigger</strong></TableCell>
                                    <TableCell><strong>Next Run</strong></TableCell>
                                    <TableCell><strong>Status</strong></TableCell>
                                    <TableCell align="right"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingJobs ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">Loading jobs...</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : jobs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">No scheduled jobs found</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    jobs.map(job => (
                                        <TableRow key={job.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {job.id}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{job.name}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                    {job.func}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {job.trigger}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatNextRunTime(job.next_run_time)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={job.pending ? 'Pending' : 'Paused'} 
                                                    size="small"
                                                    color={job.pending ? 'primary' : 'default'}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                                    <IconButton 
                                                        size="small" 
                                                        color="success"
                                                        title="Run Now"
                                                        onClick={() => runJobNow(job.id)}
                                                    >
                                                        <PlayIcon size={16} />
                                                    </IconButton>
                                                    {job.pending ? (
                                                        <IconButton 
                                                            size="small" 
                                                            color="warning"
                                                            title="Pause"
                                                            onClick={() => pauseJob(job.id)}
                                                        >
                                                            <PauseIcon size={16} />
                                                        </IconButton>
                                                    ) : (
                                                        <IconButton 
                                                            size="small" 
                                                            color="info"
                                                            title="Resume"
                                                            onClick={() => resumeJob(job.id)}
                                                        >
                                                            <ResumeIcon size={16} />
                                                        </IconButton>
                                                    )}
                                                    <IconButton 
                                                        size="small" 
                                                        color="primary"
                                                        title="Edit"
                                                        onClick={() => openEditDialog(job)}
                                                    >
                                                        <EditIcon size={16} />
                                                    </IconButton>
                                                    <IconButton 
                                                        size="small" 
                                                        color="error"
                                                        title="Delete"
                                                        onClick={() => deleteJob(job.id, job.name)}
                                                    >
                                                        <DeleteIcon size={16} />
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Add/Edit Job Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{isEditMode ? 'Edit Job' : 'Create New Job'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={3}>
                        <TextField
                            fullWidth
                            label="Job ID"
                            value={form.id}
                            onChange={(e) => setForm({ ...form, id: e.target.value })}
                            disabled={isEditMode}
                            required
                            size="small"
                            helperText="Unique identifier for the job"
                        />

                        <TextField
                            fullWidth
                            label="Job Name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                            size="small"
                            helperText="Human-readable name for the job"
                        />

                        <TextField
                            fullWidth
                            label="Function Path"
                            value={form.func}
                            onChange={(e) => setForm({ ...form, func: e.target.value })}
                            required
                            size="small"
                            placeholder="e.g., src.scheduler.example_job"
                            helperText="Fully qualified path to the function (module.function)"
                        />

                        <FormControl fullWidth size="small">
                            <InputLabel>Trigger Type</InputLabel>
                            <Select
                                value={form.trigger_type}
                                label="Trigger Type"
                                onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                            >
                                {triggerTypes.map(type => (
                                    <MenuItem key={type.value} value={type.value}>
                                        {type.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            fullWidth
                            type="number"
                            label="Max Instances"
                            value={form.max_instances}
                            onChange={(e) => setForm({ 
                                ...form, 
                                max_instances: Math.max(1, parseInt(e.target.value) || 1)
                            })}
                            size="small"
                            helperText="Maximum number of concurrent job instances (minimum 1)"
                            inputProps={{ min: 1 }}
                        />

                        {/* Interval Trigger Configuration */}
                        {form.trigger_type === 'interval' && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                    Interval Configuration
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Minutes"
                                            value={form.trigger.minutes || ''}
                                            onChange={(e) => setForm({ 
                                                ...form, 
                                                trigger: { ...form.trigger, minutes: parseInt(e.target.value) || 0 } 
                                            })}
                                            size="small"
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Hours"
                                            value={form.trigger.hours || ''}
                                            onChange={(e) => setForm({ 
                                                ...form, 
                                                trigger: { ...form.trigger, hours: parseInt(e.target.value) || 0 } 
                                            })}
                                            size="small"
                                        />
                                    </Grid>
                                </Grid>
                            </Box>
                        )}

                        {/* Cron Trigger Configuration */}
                        {form.trigger_type === 'cron' && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>
                                    Cron Configuration
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            label="Hour"
                                            value={form.trigger.hour || ''}
                                            onChange={(e) => setForm({ 
                                                ...form, 
                                                trigger: { ...form.trigger, hour: e.target.value } 
                                            })}
                                            size="small"
                                            placeholder="0-23 or *"
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            label="Minute"
                                            value={form.trigger.minute || ''}
                                            onChange={(e) => setForm({ 
                                                ...form, 
                                                trigger: { ...form.trigger, minute: e.target.value } 
                                            })}
                                            size="small"
                                            placeholder="0-59 or *"
                                        />
                                    </Grid>
                                </Grid>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={saveJob} 
                        variant="contained" 
                        disabled={saveState.loading || !form.id || !form.name || !form.func}
                    >
                        {saveState.loading ? 'Saving...' : isEditMode ? 'Update Job' : 'Create Job'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default memo(SchedulerJobs);
