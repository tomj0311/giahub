# BPMN Editor Component

A self-contained, reusable BPMN editor component built with React and ReactFlow.

## Features

- Complete BPMN 2.0 modeling capabilities
- Dark/Light theme support with auto-detection
- Export to BPMN XML
- Drag & drop interface
- Property panels for element configuration
- Participation panels for process collaboration
- Responsive design
- Zero external dependencies (except React ecosystem)

## Installation

Copy the entire `bpmn` folder to your project's `src` directory.

```
src/
  bpmn/
    BPMN.jsx          # Main component
    BPMN.css          # All styles
    BPMNEditor.jsx    # Core editor
    nodes/            # BPMN node components
    constants/        # BPMN constants
    utils/            # Utility functions
    hooks/            # Custom hooks
    security/         # Security utilities
    ... (other files)
```

## Dependencies

Make sure you have these packages installed in your project:

```bash
npm install react reactflow lucide-react
```

## Usage

### Basic Usage

```jsx
import React from 'react';
import BPMN from './bpmn/BPMN';

function App() {
  return (
    <div className="App">
      <BPMN />
    </div>
  );
}
```

### Advanced Usage

```jsx
import React from 'react';
import BPMN from './bpmn/BPMN';

function App() {
  const handleThemeChange = (theme) => {
    console.log('BPMN theme changed to:', theme);
  };

  return (
    <div className="App">
      <BPMN 
        initialTheme="auto"           // 'light', 'dark', or 'auto'
        onThemeChange={handleThemeChange}
        className="my-bpmn-editor"
        style={{ height: '600px', width: '800px' }}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialTheme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Initial theme setting |
| `onThemeChange` | `(theme: string) => void` | `undefined` | Callback when theme changes |
| `className` | `string` | `''` | Additional CSS classes |
| `style` | `object` | `{}` | Inline styles |

## Theming

The component supports automatic theme detection and manual theme switching:

- **Auto mode**: Detects system preference and remembers user choice
- **Light mode**: Forces light theme
- **Dark mode**: Forces dark theme

Theme preference is automatically saved to localStorage when using auto mode.

## Customization

### Custom Sizing

```jsx
// Full viewport (default)
<BPMN />

// Custom size
<BPMN 
  style={{ height: '600px', width: '800px' }}
  className="bpmn-custom-size"
/>

// Responsive (fills parent container)
<BPMN className="bpmn-responsive" />
```

### Custom Styling

You can override styles by targeting the `.bpmn-container` class:

```css
.my-custom-bpmn .bpmn-container {
  border: 2px solid #ccc;
  border-radius: 8px;
}
```

## File Structure

```
bpmn/
├── BPMN.jsx                    # Main component entry point
├── BPMN.css                    # All component styles
├── BPMNEditor.jsx              # Core editor logic
├── BPMNEditor.css              # Editor-specific styles
├── BPMNExporter.jsx            # XML export functionality
├── ErrorBoundary.jsx           # Error handling
├── MessageFlowEdge.jsx         # Message flow edges
├── ParticipationPanel.jsx      # Collaboration panel
├── PropertyPanel.jsx           # Element properties
├── SmartMessageFlowEdge.jsx    # Smart message flows
├── Toolbar.jsx                 # Main toolbar
├── nodes/                      # BPMN node components
│   ├── BPMNNodes.css
│   ├── CallActivityNode.jsx
│   ├── DataObjectNode.jsx
│   ├── DataStoreNode.jsx
│   ├── EndEventNode.jsx
│   ├── GatewayNode.jsx
│   ├── GroupNode.jsx
│   ├── IntermediateEventNode.jsx
│   ├── LaneNode.jsx
│   ├── ParticipantNode.jsx
│   ├── StartEventNode.jsx
│   ├── SubProcessNode.jsx
│   ├── TaskNode.jsx
│   └── TextAnnotationNode.jsx
├── constants/
│   └── bpmnConstants.js        # BPMN element definitions
├── utils/
│   └── bpmnUtils.js           # Utility functions
├── hooks/
│   └── index.js               # Custom hooks
└── security/
    └── securityUtils.js       # Security utilities
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This component is part of the RFL-BPMN project and follows the same license terms.
