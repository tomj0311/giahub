// Simple test to verify Chart.js components are working
const TestChart = () => {
  const data = {
    labels: ['Red', 'Blue', 'Yellow'],
    datasets: [{
      label: 'Test Data',
      data: [12, 19, 3],
      backgroundColor: [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 205, 86, 0.8)',
      ],
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'Test Pie Chart'
      }
    }
  };

  return (
    <Box sx={{ height: 300, width: 300, margin: 'auto', p: 2 }}>
      <Typography variant="h6" gutterBottom>Chart Test</Typography>
      <PieChart data={data} options={options} />
    </Box>
  );
};