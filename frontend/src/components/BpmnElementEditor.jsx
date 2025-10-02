import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  IconButton,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ExpandMore,
  Add,
  Delete,
  Close,
  Save,
  ContentCopy,
} from '@mui/icons-material';

const BpmnElementEditor = ({ xmlContent, onSave, onClose, isOpen, filterElementIds = null }) => {
  const [elements, setElements] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [modifiedXml, setModifiedXml] = useState('');

  useEffect(() => {
    if (xmlContent && isOpen) {
      parseXmlToElements(xmlContent);
    }
  }, [xmlContent, isOpen]);

  const parseXmlToElements = (xml) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      
      const elementsList = [];
      
      // Find all task elements
      const tasks = doc.querySelectorAll('userTask, serviceTask, scriptTask, manualTask');
      tasks.forEach(task => {
        const element = {
          id: task.getAttribute('id'),
          name: task.getAttribute('name'),
          type: task.tagName,
          extensionElements: parseExtensionElements(task),
          script: parseScript(task),
          originalNode: task
        };
        elementsList.push(element);
      });

      // Find gateway elements
      const gateways = doc.querySelectorAll('exclusiveGateway, inclusiveGateway, parallelGateway');
      gateways.forEach(gateway => {
        const element = {
          id: gateway.getAttribute('id'),
          name: gateway.getAttribute('name'),
          type: gateway.tagName,
          conditions: parseGatewayConditions(doc, gateway.getAttribute('id')),
          originalNode: gateway
        };
        elementsList.push(element);
      });

      setElements(elementsList);
      setModifiedXml(xml);
    } catch (error) {
      console.error('Error parsing XML:', error);
    }
  };

  const parseExtensionElements = (taskNode) => {
    const extensionElements = taskNode.querySelector('extensionElements');
    if (!extensionElements) return null;

    return parseElementRecursively(extensionElements);
  };

  const parseElementRecursively = (element) => {
    if (!element || !element.children) return null;

    const result = {};

    Array.from(element.children).forEach(child => {
      const tagName = child.tagName;
      
      let value;
      if (child.children.length === 0) {
        // Leaf node - check if it has attributes or just text content
        const attributes = getElementAttributes(child);
        const textContent = child.textContent.trim();
        
        if (Object.keys(attributes).length > 0) {
          // Has attributes - create a combined representation
          if (textContent) {
            value = { ...attributes, textContent };
          } else {
            value = attributes;
          }
        } else {
          // Only text content
          value = textContent;
        }
      } else {
        // Has children - create a clean nested structure
        const childData = parseElementRecursively(child);
        const attributes = getElementAttributes(child);
        
        if (childData && Object.keys(childData).length > 0) {
          if (Object.keys(attributes).length > 0) {
            value = { ...attributes, ...childData };
          } else {
            value = childData;
          }
        } else {
          // If no meaningful children, check for attributes or text content
          const textContent = child.textContent.trim();
          if (Object.keys(attributes).length > 0) {
            if (textContent) {
              value = { ...attributes, textContent };
            } else {
              value = attributes;
            }
          } else {
            value = textContent;
          }
        }
      }

      // Handle multiple elements with the same tag name
      if (result[tagName]) {
        // If this tag already exists, convert to array or add to existing array
        if (Array.isArray(result[tagName])) {
          result[tagName].push(value);
        } else {
          result[tagName] = [result[tagName], value];
        }
      } else {
        result[tagName] = value;
      }
    });

    return result;
  };

  const getElementAttributes = (element) => {
    const attrs = {};
    if (element.attributes) {
      Array.from(element.attributes).forEach(attr => {
        // Filter out xmlns namespace declarations
        if (!attr.name.startsWith('xmlns')) {
          attrs[attr.name] = attr.value;
        }
      });
    }
    return attrs;
  };

  const parseScript = (taskNode) => {
    const script = taskNode.querySelector('script');
    if (!script) return null;
    
    return {
      format: taskNode.getAttribute('scriptFormat') || 'python',
      content: script.textContent.trim()
    };
  };

  const parseGatewayConditions = (doc, gatewayId) => {
    const flows = doc.querySelectorAll(`sequenceFlow[sourceRef="${gatewayId}"]`);
    return Array.from(flows).map(flow => ({
      id: flow.getAttribute('id'),
      name: flow.getAttribute('name') || '',
      condition: flow.querySelector('conditionExpression')?.textContent?.trim() || ''
    }));
  };

  const updateElement = (elementId, updates) => {
    setElements(prev => prev.map(el => 
      el.id === elementId ? { ...el, ...updates } : el
    ));
  };

  const updateExtensionElement = (elementId, path, value) => {
    setElements(prev => prev.map(el => {
      if (el.id === elementId) {
        const newExtensionElements = { ...el.extensionElements };
        setNestedValue(newExtensionElements, path, value);
        return { ...el, extensionElements: newExtensionElements };
      }
      return el;
    }));
  };

  const setNestedValue = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  };

  const generateUpdatedXml = () => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(modifiedXml, 'text/xml');

      elements.forEach(element => {
        const node = doc.querySelector(`[id="${element.id}"]`);
        if (!node) return;

        // Update name attribute
        if (element.name) {
          node.setAttribute('name', element.name);
        }

        // Update extensionElements
        if (element.extensionElements) {
          updateExtensionElements(doc, node, element.extensionElements);
        }

        // Update script content
        if (element.script) {
          updateScriptContent(node, element.script);
        }

        // Update gateway conditions
        if (element.conditions) {
          updateGatewayConditions(doc, element.id, element.conditions);
        }
      });

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc);
    } catch (error) {
      console.error('Error generating XML:', error);
      return modifiedXml;
    }
  };

  const updateExtensionElements = (doc, node, extensionData) => {
    let extensionElements = node.querySelector('extensionElements');
    
    if (!extensionElements) {
      extensionElements = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'extensionElements');
      node.appendChild(extensionElements);
    }

    // Clear existing content
    extensionElements.innerHTML = '';

    // Recursively build extension elements
    buildExtensionElementsRecursively(doc, extensionElements, extensionData);
  };

  const buildExtensionElementsRecursively = (doc, parentElement, data) => {
    if (!data || typeof data !== 'object') return;

    Object.entries(data).forEach(([key, value]) => {
      // Determine namespace based on element name
      let namespace = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
      if (key === 'formData' || key.includes('form')) {
        namespace = 'http://example.org/form';
      } else if (key === 'serviceConfiguration' || key.includes('service')) {
        namespace = 'http://example.org/service';
      }

      // Handle different value types
      if (Array.isArray(value)) {
        // Handle arrays - create multiple elements with the same tag name
        value.forEach(item => {
          const element = doc.createElementNS(namespace, key);
          
          if (typeof item === 'string') {
            element.textContent = item;
          } else if (typeof item === 'object') {
            // Handle attributes and nested content
            Object.entries(item).forEach(([itemKey, itemValue]) => {
              if (itemKey === 'textContent') {
                element.textContent = itemValue;
              } else if (typeof itemValue === 'string') {
                // Treat as attribute
                element.setAttribute(itemKey, itemValue);
              } else {
                // Nested object - create child elements
                const childData = { [itemKey]: itemValue };
                buildExtensionElementsRecursively(doc, element, childData);
              }
            });
          }
          
          parentElement.appendChild(element);
        });
      } else {
        // Single element
        const element = doc.createElementNS(namespace, key);
        
        if (typeof value === 'string') {
          // Simple text content
          element.textContent = value;
        } else if (value && typeof value === 'object') {
          // Handle attributes and nested content
          Object.entries(value).forEach(([subKey, subValue]) => {
            if (subKey === 'textContent') {
              element.textContent = subValue;
            } else if (typeof subValue === 'string') {
              // Treat as attribute
              element.setAttribute(subKey, subValue);
            } else {
              // Nested object - create child elements
              const childData = { [subKey]: subValue };
              buildExtensionElementsRecursively(doc, element, childData);
            }
          });
        }
        
        parentElement.appendChild(element);
      }
    });
  };

  const updateScriptContent = (node, scriptData) => {
    let script = node.querySelector('script');
    if (!script) {
      script = node.ownerDocument.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'script');
      node.appendChild(script);
    }
    
    if (scriptData.format) {
      node.setAttribute('scriptFormat', scriptData.format);
    }
    
    script.innerHTML = '';
    script.appendChild(node.ownerDocument.createCDATASection(scriptData.content));
  };

  const updateGatewayConditions = (doc, gatewayId, conditions) => {
    conditions.forEach(condition => {
      const flow = doc.querySelector(`sequenceFlow[id="${condition.id}"]`);
      if (flow && condition.name) {
        flow.setAttribute('name', condition.name);
        
        if (condition.condition) {
          let conditionExpr = flow.querySelector('conditionExpression');
          if (!conditionExpr) {
            conditionExpr = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'conditionExpression');
            conditionExpr.setAttribute('xsi:type', 'tFormalExpression');
            flow.appendChild(conditionExpr);
          }
          conditionExpr.textContent = condition.condition;
        }
      }
    });
  };

  const isLeafObject = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check if all values are strings (leaf object) or if it has typical leaf patterns
    const values = Object.values(obj);
    const allStrings = values.every(val => typeof val === 'string');
    
    if (allStrings) return true;
    
    // Check for common leaf object patterns
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    const leafPatterns = ['name', 'value', 'id', 'label', 'type', 'required', 'textcontent'];
    const hasLeafPattern = keys.some(key => leafPatterns.includes(key));
    
    return hasLeafPattern && !values.some(val => typeof val === 'object' && !Array.isArray(val));
  };

  const renderExtensionElement = (elementId, key, value, path = '') => {
    const currentPath = path ? `${path}.${key}` : key;
    
    // If value is a simple string, render as text field
    if (typeof value === 'string') {
      return (
        <TextField
          key={currentPath}
          label={key.charAt(0).toUpperCase() + key.slice(1)}
          value={value || ''}
          onChange={(e) => updateExtensionElement(elementId, currentPath, e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 1 }}
        />
      );
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return (
        <div key={currentPath} style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <Typography variant="subtitle2">
              {key.charAt(0).toUpperCase() + key.slice(1)} ({value.length})
            </Typography>
            <Button
              startIcon={<Add />}
              onClick={() => addToArray(elementId, currentPath, createDefaultItem(key, value))}
              variant="text"
              size="small"
            >
              Add
            </Button>
          </div>
          {value.map((item, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px', alignItems: 'flex-start' }}>
              {typeof item === 'string' ? (
                <TextField
                  label={`${key} ${index + 1}`}
                  value={item}
                  onChange={(e) => {
                    const newArray = [...value];
                    newArray[index] = e.target.value;
                    updateExtensionElement(elementId, currentPath, newArray);
                  }}
                  fullWidth
                  size="small"
                />
              ) : typeof item === 'object' ? (
                <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                  {Object.entries(item).map(([itemKey, itemValue]) => (
                    <TextField
                      key={itemKey}
                      label={itemKey.charAt(0).toUpperCase() + itemKey.slice(1)}
                      value={itemValue || ''}
                      onChange={(e) => {
                        const newArray = [...value];
                        newArray[index] = {
                          ...newArray[index],
                          [itemKey]: e.target.value
                        };
                        updateExtensionElement(elementId, currentPath, newArray);
                      }}
                      size="small"
                      style={{ minWidth: '150px', flex: 1 }}
                    />
                  ))}
                </div>
              ) : null}
              <IconButton
                onClick={() => removeFromArray(elementId, currentPath, index)}
                color="error"
                size="small"
              >
                <Delete />
              </IconButton>
            </div>
          ))}
        </div>
      );
    }

    // If value is an object, render fields inline
    if (value && typeof value === 'object') {
      return (
        <div key={currentPath} style={{ marginBottom: '8px' }}>
          <Typography variant="subtitle2" style={{ marginBottom: '4px' }}>
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </Typography>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(value).map(([subKey, subValue]) => {
              if (typeof subValue === 'string') {
                const isTextContent = subKey.toLowerCase().includes('content') || 
                                     subKey.toLowerCase().includes('text') ||
                                     subKey.toLowerCase().includes('description') ||
                                     subKey.toLowerCase().includes('message');
                
                return (
                  <TextField
                    key={subKey}
                    label={subKey.charAt(0).toUpperCase() + subKey.slice(1)}
                    value={subValue || ''}
                    onChange={(e) => updateExtensionElement(elementId, `${currentPath}.${subKey}`, e.target.value)}
                    size="small"
                    multiline={isTextContent}
                    rows={isTextContent ? 2 : 1}
                    style={{ 
                      minWidth: isTextContent ? '300px' : '150px',
                      flex: isTextContent ? '1 1 100%' : '1'
                    }}
                  />
                );
              }
              return null;
            })}
          </div>
          {/* Render nested objects */}
          {Object.entries(value).map(([subKey, subValue]) => {
            if (typeof subValue !== 'string') {
              return renderExtensionElement(elementId, subKey, subValue, currentPath);
            }
            return null;
          })}
        </div>
      );
    }

    return null;
  };

  const getNestedValue = (obj, path) => {
    if (!obj || !path) return null;
    return path.split('.').reduce((current, key) => current && current[key], obj);
  };

  const addToArray = (elementId, path, newItem) => {
    setElements(prev => prev.map(el => {
      if (el.id === elementId) {
        const newExtensionElements = { ...el.extensionElements };
        const keys = path.split('.');
        let current = newExtensionElements;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!(key in current)) {
            current[key] = {};
          }
          current = current[key];
        }
        
        const finalKey = keys[keys.length - 1];
        if (!current[finalKey]) {
          current[finalKey] = [];
        }
        if (Array.isArray(current[finalKey])) {
          current[finalKey] = [...current[finalKey], newItem];
        } else {
          // Convert single item to array and add new item
          current[finalKey] = [current[finalKey], newItem];
        }
        
        return { ...el, extensionElements: newExtensionElements };
      }
      return el;
    }));
  };

  const removeFromArray = (elementId, path, index) => {
    setElements(prev => prev.map(el => {
      if (el.id === elementId) {
        const newExtensionElements = { ...el.extensionElements };
        const keys = path.split('.');
        let current = newExtensionElements;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!(key in current)) {
            return el;
          }
          current = current[key];
        }
        
        const finalKey = keys[keys.length - 1];
        if (current[finalKey] && Array.isArray(current[finalKey])) {
          const newArray = current[finalKey].filter((_, i) => i !== index);
          if (newArray.length === 1) {
            // Convert back to single item if only one left
            current[finalKey] = newArray[0];
          } else if (newArray.length === 0) {
            // Remove the key if array is empty
            delete current[finalKey];
          } else {
            current[finalKey] = newArray;
          }
        }
        
        return { ...el, extensionElements: newExtensionElements };
      }
      return el;
    }));
  };

  const createDefaultItem = (key, existingItems) => {
    // Analyze existing items to create appropriate defaults
    if (existingItems && existingItems.length > 0) {
      const firstItem = existingItems[0];
      if (typeof firstItem === 'object') {
        // Create default based on structure of existing items
        const defaultItem = {};
        Object.keys(firstItem).forEach(itemKey => {
          defaultItem[itemKey] = '';
        });
        return defaultItem;
      }
    }
    
    // Create sensible defaults based on common patterns
    if (key.toLowerCase().includes('parameter')) {
      return { name: '', value: '' };
    }
    if (key.toLowerCase().includes('field')) {
      return { id: '', label: '', type: 'string', required: 'false' };
    }
    if (key.toLowerCase().includes('property')) {
      return { name: '', value: '' };
    }
    
    // Default fallback
    return '';
  };

  const handleSave = () => {
    const updatedXml = generateUpdatedXml();
    onSave(updatedXml);
    onClose();
  };

  const copyElementXml = (element) => {
    const updatedXml = generateUpdatedXml();
    const parser = new DOMParser();
    const doc = parser.parseFromString(updatedXml, 'text/xml');
    const node = doc.querySelector(`[id="${element.id}"]`);
    
    if (node) {
      const serializer = new XMLSerializer();
      const elementXml = serializer.serializeToString(node);
      navigator.clipboard.writeText(elementXml);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          height: 'calc(100vh - 100px)',
          maxHeight: 'calc(100vh - 100px)',
          width: '80vw',
          maxWidth: '1200px',
        }
      }}
    >
      <DialogTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography variant="h6">BPMN Element Editor</Typography>
            {filterElementIds && (
              <Typography variant="caption" color="text.secondary">
                Filtered: {Array.isArray(filterElementIds) ? filterElementIds.join(', ') : filterElementIds}
              </Typography>
            )}
          </div>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </div>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {(() => {
          if (elements.length === 0) {
            return <Typography color="text.secondary">No editable elements found in XML</Typography>;
          }
          
          const filteredElements = elements.filter((element) => {
            // If filterElementIds is provided, only show elements with those IDs
            if (filterElementIds) {
              if (Array.isArray(filterElementIds)) {
                return filterElementIds.includes(element.id);
              } else {
                return element.id === filterElementIds;
              }
            }
            // If no filter provided, show all elements
            return true;
          });

          if (filteredElements.length === 0) {
            const filterInfo = Array.isArray(filterElementIds) 
              ? filterElementIds.join(', ') 
              : filterElementIds;
            return (
              <Typography color="text.secondary">
                No elements found with ID(s): {filterInfo}
              </Typography>
            );
          }

          return filteredElements.map((element) => (
            <Accordion 
              key={element.id} 
              sx={{ mb: 1 }}
              defaultExpanded={!!filterElementIds}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Chip 
                    label={element.type} 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                  <div>
                    <Typography variant="subtitle1">{element.name || 'Unnamed Element'}</Typography>
                    <Typography variant="caption" color="text.secondary">ID: {element.id}</Typography>
                  </div>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyElementXml(element);
                    }}
                  >
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </div>
              </AccordionSummary>
              <AccordionDetails>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Basic Properties */}
                  <TextField
                    label="Name"
                    value={element.name || ''}
                    onChange={(e) => updateElement(element.id, { name: e.target.value })}
                    fullWidth
                    size="small"
                  />

                  {/* Extension Elements - Generic Renderer */}
                  {element.extensionElements && (
                    <div>
                      <Typography variant="h6" gutterBottom>Extension Elements</Typography>
                      {Object.entries(element.extensionElements).map(([key, value]) => 
                        renderExtensionElement(element.id, key, value)
                      )}
                    </div>
                  )}

                  {/* Script Task */}
                  {element.type === 'scriptTask' && element.script && (
                    <div>
                      <Typography variant="subtitle2" gutterBottom>Script</Typography>
                      <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                        <InputLabel>Script Format</InputLabel>
                        <Select
                          value={element.script.format || 'python'}
                          onChange={(e) => updateElement(element.id, {
                            script: { ...element.script, format: e.target.value }
                          })}
                        >
                          <MenuItem value="python">Python</MenuItem>
                          <MenuItem value="javascript">JavaScript</MenuItem>
                          <MenuItem value="groovy">Groovy</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        label="Script Content"
                        value={element.script.content || ''}
                        onChange={(e) => updateElement(element.id, {
                          script: { ...element.script, content: e.target.value }
                        })}
                        multiline
                        rows={6}
                        fullWidth
                        sx={{ fontFamily: 'monospace' }}
                      />
                    </div>
                  )}

                  {/* Gateway Conditions */}
                  {element.type.includes('Gateway') && element.conditions && (
                    <div>
                      <Typography variant="subtitle2" gutterBottom>Sequence Flow Conditions</Typography>
                      {element.conditions.map((condition, index) => (
                        <div key={condition.id} style={{ marginBottom: '12px', padding: '12px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                          <TextField
                            label="Flow Name"
                            value={condition.name}
                            onChange={(e) => {
                              const newConditions = [...element.conditions];
                              newConditions[index].name = e.target.value;
                              updateElement(element.id, { conditions: newConditions });
                            }}
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                          />
                          <TextField
                            label="Condition Expression"
                            value={condition.condition}
                            onChange={(e) => {
                              const newConditions = [...element.conditions];
                              newConditions[index].condition = e.target.value;
                              updateElement(element.id, { conditions: newConditions });
                            }}
                            fullWidth
                            size="small"
                            multiline
                            rows={2}
                            sx={{ fontFamily: 'monospace' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionDetails>
            </Accordion>
          ));
        })()}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BpmnElementEditor;