# Dynamic Component Usage Guide

## Overview
The `DynamicComponent` allows you to render React components from JSX code stored in BPMN workflow definitions. This is particularly useful for user tasks that require custom forms.

## How It Works

### 1. BPMN Task Spec Structure
In your BPMN workflow, the task spec should contain script data in markdown format:

```python
task_spec.extensions = {
    'extensionElements': {
        'formData': {
            'scriptData': {
                'script': '```jsx\n<your JSX code here>\n```'
            },
            'formField': [
                {'id': 'field1', 'label': 'Field 1', 'type': 'string', 'required': 'true'},
                # ... more fields
            ]
        }
    }
}
```

### 2. Writing Dynamic Components
Your JSX component should follow this pattern:

```jsx
const NameForm = () => {
  const [formData, setFormData] = React.useState({
    first_name: '',
    last_name: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = () => {
    // Validate if needed
    if (!formData.first_name || !formData.last_name) {
      alert('Please fill all required fields');
      return;
    }
    
    // Submit the form data using the global submitWorkflowForm function
    submitWorkflowForm(formData);
  };

  return (
    <Box>
      <TextField
        fullWidth
        label="First Name"
        value={formData.first_name}
        onChange={(e) => handleChange('first_name', e.target.value)}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Last Name"
        value={formData.last_name}
        onChange={(e) => handleChange('last_name', e.target.value)}
        sx={{ mb: 2 }}
      />
      <Button
        variant="contained"
        onClick={handleSubmit}
      >
        Submit Task
      </Button>
    </Box>
  );
};
```

### 3. Key Points

#### Props Available
- **`submitWorkflowForm(data)`**: Global function to submit form data. Call this when user clicks submit.
  - No props needed - it's available globally in your component
  - Just call: `submitWorkflowForm(yourFormData)`

#### Best Practices
1. **Always use React.useState, React.useEffect, etc.** - Don't use destructured imports
2. **Call submitWorkflowForm with your form data** - This triggers the API call in the parent component
3. **No props needed** - `submitWorkflowForm` is globally available in the execution context
4. **Add validation before submit** - Check required fields before calling submitWorkflowForm
5. **Component name should match** - The component name in your code should be consistent
6. **MUI components are available** - You can use Box, TextField, Button, etc. directly
7. **No imports needed** - All MUI components and React hooks are provided in the execution context

#### Available Components
All Material-UI components are available, including:
- Layout: Box, Container, Stack, Grid, Paper, Card, CardContent, CardActions
- Input: TextField, Checkbox, Radio, Switch, Select, Autocomplete
- Display: Typography, Divider, Chip, Avatar, Badge
- Feedback: Alert, CircularProgress, LinearProgress
- Navigation: Tabs, Tab, Breadcrumbs, Link
- And many more...

### 4. Data Flow

```
BPMN Task Spec (scriptData)
    ↓
TaskCompletion extracts JSX from markdown
    ↓
DynamicComponent compiles and renders JSX
    ↓
submitWorkflowForm() is available globally in component
    ↓
User fills form and clicks submit in your component
    ↓
Your component calls submitWorkflowForm(formData)
    ↓
Custom event dispatched to parent
    ↓
TaskCompletion.handleSubmit receives the data
    ↓
API call is made to backend
    ↓
Success screen shown
```

### 5. Example: Complete Form Component

```jsx
const UserDetailsForm = ({ onSubmit, submitting }) => {
  const [formData, setFormData] = React.useState({
    first_name: '',
    last_name: '',
    email: '',
    age: '',
    subscribe: false
  });

  const [errors, setErrors] = React.useState({});

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = () => {
    console.log('Form submit clicked, current data:', formData);
    
    // Validate
    const newErrors = {};
    if (!formData.first_name) newErrors.first_name = 'First name is required';
    if (!formData.last_name) newErrors.last_name = 'Last name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      console.log('Validation failed:', newErrors);
      return;
    }
    
    console.log('Validation passed, calling onSubmit');
    // Call parent's onSubmit with the form data
    if (onSubmit) {
      onSubmit(formData);
    } else {
      console.error('onSubmit is not defined!');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6">User Details</Typography>
      
      <TextField
        fullWidth
        required
        label="First Name"
        value={formData.first_name}
        onChange={handleChange('first_name')}
        error={!!errors.first_name}
        helperText={errors.first_name}
      />
      
      <TextField
        fullWidth
        required
        label="Last Name"
        value={formData.last_name}
        onChange={handleChange('last_name')}
        error={!!errors.last_name}
        helperText={errors.last_name}
      />
      
      <TextField
        fullWidth
        required
        type="email"
        label="Email"
        value={formData.email}
        onChange={handleChange('email')}
        error={!!errors.email}
        helperText={errors.email}
      />
      
      <TextField
        fullWidth
        type="number"
        label="Age"
        value={formData.age}
        onChange={handleChange('age')}
      />
      
      <FormControlLabel
        control={
          <Checkbox
            checked={formData.subscribe}
            onChange={handleChange('subscribe')}
          />
        }
        label="Subscribe to newsletter"
      />
      
      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={submitting}
        startIcon={submitting ? <CircularProgress size={16} /> : null}
        fullWidth
      >
        {submitting ? 'Submitting...' : 'Submit Task'}
      </Button>
    </Box>
  );
};
```

## Troubleshooting

### Component Not Rendering
- Check browser console for compilation errors
- Ensure JSX is properly wrapped in ```jsx ... ```
- Verify component returns valid JSX

### Form Data Not Submitting
- **Check console logs** - Look for "📤 DynamicComponent - onSubmit called" message
- Ensure you're calling `onSubmit(formData)` when user clicks submit
- Verify `onSubmit` is not null before calling: `if (onSubmit) { onSubmit(data); }`
- Check that you're passing the correct data object to `onSubmit`
- Look for "🚀 handleSubmit called!" in console to confirm API call is triggered

### API Call Not Made
- Check if "📤 DynamicComponent - onSubmit called" appears in console
- If YES: Check TaskCompletion logs for API errors
- If NO: Your component isn't calling `onSubmit` - check your submit button handler

### Syntax Errors
- Don't use ES6 imports - all dependencies are provided
- Use `React.useState` not just `useState`
- Ensure proper JSX syntax (closing tags, proper nesting)

### Debugging Tips
Add console.logs in your component:
```jsx
const handleSubmit = () => {
  console.log('Submit clicked!');
  console.log('onSubmit exists?', !!onSubmit);
  console.log('Form data:', formData);
  if (onSubmit) {
    onSubmit(formData);
  }
};
```
