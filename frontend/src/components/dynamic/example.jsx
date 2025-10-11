import React from 'react';
import { DynamicComponent } from './index.js';

// Example usage of DynamicComponent
const DynamicComponentExample = () => {
  // Your EmailForm component as a string (this would come from AI)
  const emailFormCode = `
const EmailForm = () => {
  const [formData, setFormData] = useState({
    recipient: '',
    subject: '',
    message: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = () => {
    console.log('Email data:', formData);
    alert('Email submission simulated: ' + JSON.stringify(formData));
    setFormData({ recipient: '', subject: '', message: '' });
  };

  // Dynamic component loading - AI can use ANY MUI component!
  const Container = loadMuiComponent('Container');
  const Box = loadMuiComponent('Box');
  const Typography = loadMuiComponent('Typography');
  const Grid = loadMuiComponent('Grid');
  const TextField = loadMuiComponent('TextField');
  const Button = loadMuiComponent('Button');
  
  // Dynamic icon loading
  const SendIcon = loadMuiIcon('Send');
  const EmailIcon = loadMuiIcon('Email');

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          <EmailIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Send Email
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Recipient Email"
              name="recipient"
              value={formData.recipient}
              onChange={handleChange}
              variant="outlined"
              required
              type="email"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              variant="outlined"
              required
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              variant="outlined"
              multiline
              rows={4}
              required
            />
          </Grid>
          <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SendIcon />}
              onClick={handleSubmit}
              sx={{ mt: 2 }}
              size="large"
            >
              Send Email
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};
  `;

  return (
    <div>
      <h2>Dynamic Component Example</h2>
      <DynamicComponent componentCode={emailFormCode} />
    </div>
  );
};

export default DynamicComponentExample;