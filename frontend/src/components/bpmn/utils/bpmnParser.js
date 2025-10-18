// Shared BPMN XML parser utility
// This function parses BPMN 2.0 XML and converts it to React Flow compatible nodes and edges

// Helper function to capture nested XML elements for preservation
// Excludes incoming/outgoing flow references since they're generated dynamically
export const captureNestedElements = (element) => {
  if (!element) return '';
  
  try {
    // Use XMLSerializer to preserve exact XML case and structure
    const serializer = new XMLSerializer();
    let xmlContent = '';
    
    // Serialize each child element individually to preserve XML structure
    Array.from(element.childNodes).forEach(child => {
      // Skip incoming/outgoing elements since they'll be generated dynamically
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();
        if (tagName !== 'incoming' && tagName !== 'outgoing' && 
            !tagName.includes(':incoming') && !tagName.includes(':outgoing')) {
          xmlContent += serializer.serializeToString(child);
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        // Preserve text content
        xmlContent += child.textContent;
      }
    });
    
    return xmlContent;
  } catch (error) {
    console.warn('Failed to capture nested elements with XMLSerializer, falling back to innerHTML:', error);
    
    // Fallback to original method if XMLSerializer fails
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML || '';
    
    // Remove incoming and outgoing elements since they'll be generated dynamically
    const incomingElements = tempDiv.querySelectorAll('incoming, bpmn\\:incoming, bpmn2\\:incoming');
    const outgoingElements = tempDiv.querySelectorAll('outgoing, bpmn\\:outgoing, bpmn2\\:outgoing');
    
    incomingElements.forEach(el => el.remove());
    outgoingElements.forEach(el => el.remove());
    
    return tempDiv.innerHTML || '';
  }
};

// Helper function to escape XML characters
export const escapeXML = (str) => {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Helper to read all attributes from an Element into a plain object
export const getAttributesMap = (el) => {
  if (!el || !el.attributes) return {};
  const attrs = {};
  // NamedNodeMap to array
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    attrs[attr.name] = attr.value;
  }
  return attrs;
};

// Helper to build an attribute string from a map, preserving ALL original attributes
export const buildAttributesString = (attrsMap = {}, options = {}) => {
  const { exclude = [], overrides = {} } = options;
  const pieces = [];
  const excluded = new Set(exclude);
  
  // First add all original attributes (except excluded ones)
  Object.keys(attrsMap).forEach((key) => {
    if (excluded.has(key)) return;
    const value = attrsMap[key];
    if (value === undefined || value === null) return;
    pieces.push(`${key}="${escapeXML(value)}"`);
  });
  
  // Then add any overrides that weren't already included
  Object.keys(overrides).forEach((key) => {
    if (excluded.has(key)) return;
    if (attrsMap.hasOwnProperty(key)) return; // Already added above
    const value = overrides[key];
    if (value === undefined || value === null) return;
    pieces.push(`${key}="${escapeXML(value)}"`);
  });
  
  return pieces.length ? ' ' + pieces.join(' ') : '';
};

// Main BPMN XML parsing function
export const parseBPMNXML = (xmlString) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      const errorDetails = parseError.textContent || parseError.innerText || 'Unknown parsing error';
      throw new Error('Invalid XML format: ' + errorDetails);
    }

    const nodes = [];
    const edges = [];
    let nodeCounter = 1;
    let edgeCounter = 1;

    // Get diagram information for positioning
    const shapes = xmlDoc.querySelectorAll('bpmndi\\:BPMNShape, BPMNShape');
    const shapeMap = {};

    shapes.forEach(shape => {
      const bpmnElement = shape.getAttribute('bpmnElement');
      
      // Check for duplicate shape definitions - only use the first occurrence
      if (shapeMap[bpmnElement]) {
        console.warn(`Duplicate BPMNShape detected for element: ${bpmnElement}. Using first occurrence.`);
        return; // Skip duplicate shape
      }
      
      const bounds = shape.querySelector('dc\\:Bounds, Bounds');
      if (bounds) {
        // Parse label bounds if present
        let labelBounds = undefined;
        const label = shape.querySelector('bpmndi\\:BPMNLabel, BPMNLabel');
        if (label) {
          const lb = label.querySelector('dc\\:Bounds, Bounds');
          if (lb) {
            labelBounds = {
              x: parseFloat(lb.getAttribute('x')) || 0,
              y: parseFloat(lb.getAttribute('y')) || 0,
              width: parseFloat(lb.getAttribute('width')) || 0,
              height: parseFloat(lb.getAttribute('height')) || 0
            };
          }
        }

        // Parse color information from shape and preserve extension elements
        let backgroundColor = shape.getAttribute('bioc:fill') || 
                            shape.getAttribute('color:background-color');
        let borderColor = shape.getAttribute('bioc:stroke') ||
                        shape.getAttribute('color:border-color');
        let originalExtensionElements = null;
        
        // If no bioc attributes found, check for standard BPMN 2.0 extension elements
        if (!backgroundColor || !borderColor) {
          const extensionElements = shape.querySelector('bpmndi\\:BPMNExtensionElements, BPMNExtensionElements');
          if (extensionElements) {
            // Preserve the entire extension elements for re-export
            const serializer = new XMLSerializer();
            originalExtensionElements = serializer.serializeToString(extensionElements);
            
            // Check for fillColor element
            const fillColorElement = extensionElements.querySelector('bpmndi\\:fillColor, fillColor');
            if (fillColorElement && !backgroundColor) {
              const red = fillColorElement.getAttribute('red') || '0';
              const green = fillColorElement.getAttribute('green') || '0';
              const blue = fillColorElement.getAttribute('blue') || '0';
              backgroundColor = `rgb(${red}, ${green}, ${blue})`;
            }
            
            // Check for strokeColor element
            const strokeColorElement = extensionElements.querySelector('bpmndi\\:strokeColor, strokeColor');
            if (strokeColorElement && !borderColor) {
              const red = strokeColorElement.getAttribute('red') || '0';
              const green = strokeColorElement.getAttribute('green') || '0';
              const blue = strokeColorElement.getAttribute('blue') || '0';
              borderColor = `rgb(${red}, ${green}, ${blue})`;
            }
          }
        }

        shapeMap[bpmnElement] = {
          x: parseFloat(bounds.getAttribute('x')) || 0,
          y: parseFloat(bounds.getAttribute('y')) || 0,
          width: parseFloat(bounds.getAttribute('width')) || 100,
          height: parseFloat(bounds.getAttribute('height')) || 60,
          shapeId: shape.getAttribute('id'), // Store original shape ID
          labelBounds,
          // Store color information
          backgroundColor: backgroundColor || undefined,
          borderColor: borderColor || undefined,
          // Store original extension elements for preservation
          originalExtensionElements: originalExtensionElements || undefined
        };
      }
    });

    // Get diagram information for edges (waypoints and label bounds)
    const bpmndiEdges = xmlDoc.querySelectorAll('bpmndi\\:BPMNEdge, BPMNEdge');
    const edgeShapeMap = {};
    bpmndiEdges.forEach(edgeShape => {
      const bpmnElement = edgeShape.getAttribute('bpmnElement');
      
      // Check for duplicate edge shape definitions - only use the first occurrence
      if (edgeShapeMap[bpmnElement]) {
        console.warn(`Duplicate BPMNEdge detected for element: ${bpmnElement}. Using first occurrence.`);
        return; // Skip duplicate edge shape
      }
      
      const shapeId = edgeShape.getAttribute('id');
      const waypoints = [];
      edgeShape.querySelectorAll('di\\:waypoint, waypoint').forEach(wp => {
        waypoints.push({
          x: parseFloat(wp.getAttribute('x')) || 0,
          y: parseFloat(wp.getAttribute('y')) || 0
        });
      });
      let labelBounds = undefined;
      const label = edgeShape.querySelector('bpmndi\\:BPMNLabel, BPMNLabel');
      if (label) {
        const lb = label.querySelector('dc\\:Bounds, Bounds');
        if (lb) {
          labelBounds = {
            x: parseFloat(lb.getAttribute('x')) || 0,
            y: parseFloat(lb.getAttribute('y')) || 0,
            width: parseFloat(lb.getAttribute('width')) || 0,
            height: parseFloat(lb.getAttribute('height')) || 0
          };
        }
      }
      edgeShapeMap[bpmnElement] = { shapeId, waypoints, labelBounds };
    });

    // First, parse participants from collaboration
    const collaboration = xmlDoc.querySelector('bpmn2\\:collaboration, bpmn\\:collaboration, collaboration');
    const participantMap = {};

    if (collaboration) {
      const participants = collaboration.querySelectorAll('bpmn2\\:participant, bpmn\\:participant, participant');
      participants.forEach(participant => {
        const id = participant.getAttribute('id');
        const name = participant.getAttribute('name') || 'Participant';
        const processRef = participant.getAttribute('processRef');
        const position = shapeMap[id] || { x: 50, y: 50 + Object.keys(participantMap).length * 280 };
        const originalAttributes = getAttributesMap(participant);
        const documentationEls = participant.querySelectorAll('documentation');
        const originalDocumentation = Array.from(documentationEls).map(d => d.textContent || '');

        participantMap[processRef] = {
          id,
          name,
          processRef,
          position,
          bounds: shapeMap[id]
        };

        // Create participant node with lane information
        const participantData = {
          label: name,
          processRef,
          lanes: [],
          participantBounds: position,
          originalShapeId: shapeMap[id]?.shapeId,
          originalBounds: shapeMap[id] ? {
            x: shapeMap[id].x,
            y: shapeMap[id].y,
            width: shapeMap[id].width,
            height: shapeMap[id].height
          } : undefined,
          originalLabelBounds: shapeMap[id]?.labelBounds,
          originalAttributes,
          originalDocumentation
        };

        nodes.push({
          id,
          type: 'participant',
          position: { x: position.x, y: position.y },
          data: participantData,
          style: {
            zIndex: -1,
            width: position.width || 910,
            height: position.height || 250
          }
        });

        participantMap[processRef].nodeData = participantData;
      });
    }

    // Parse processes and their elements
    const processes = xmlDoc.querySelectorAll('bpmn2\\:process, bpmn\\:process, process');
    // Capture process-level attributes and documentation per process id
    const processMeta = {};

    processes.forEach(process => {
      const processId = process.getAttribute('id');
      const processAttributes = getAttributesMap(process);
      // Only get DIRECT child documentation elements, not nested ones
      const procDocEls = Array.from(process.children).filter(child => child.tagName === 'documentation');
      const processDocumentation = procDocEls.map(d => d.textContent || '');
      processMeta[processId] = { originalAttributes: processAttributes, originalDocumentation: processDocumentation };
      const participant = participantMap[processId];
      const participantBounds = participant?.bounds || { x: 0, y: 0, width: 910, height: 250 };

      // First, parse lanes and build a lane hierarchy
      const laneMap = {};
      const laneSetElements = process.querySelectorAll('bpmn2\\:laneSet, bpmn\\:laneSet, laneSet');

      laneSetElements.forEach(laneSet => {
        const lanes = laneSet.querySelectorAll('bpmn2\\:lane, bpmn\\:lane, lane');
        lanes.forEach(lane => {
          const laneId = lane.getAttribute('id');
          const laneName = lane.getAttribute('name') || 'Lane';
          const lanePosition = shapeMap[laneId] || {
            x: participantBounds.x + 60,
            y: participantBounds.y + 30 + Object.keys(laneMap).length * 120,
            width: participantBounds.width - 80,
            height: 120
          };

          // Get flow node references for this lane
          const flowNodeRefs = [];
          const flowNodeRefElements = lane.querySelectorAll('bpmn2\\:flowNodeRef, bpmn\\:flowNodeRef, flowNodeRef');
          flowNodeRefElements.forEach(ref => {
            flowNodeRefs.push(ref.textContent.trim());
          });

          laneMap[laneId] = {
            id: laneId,
            name: laneName,
            position: lanePosition,
            flowNodeRefs: flowNodeRefs,
            participantId: participant?.id,
            originalShapeId: shapeMap[laneId]?.shapeId,
            originalBounds: shapeMap[laneId] ? {
              x: shapeMap[laneId].x,
              y: shapeMap[laneId].y,
              width: shapeMap[laneId].width,
              height: shapeMap[laneId].height
            } : undefined,
            originalLabelBounds: shapeMap[laneId]?.labelBounds
          };
        });
      });

      // Update participant with lane information
      if (participant && participant.nodeData) {
        participant.nodeData.lanes = Object.values(laneMap).filter(lane => lane.participantId === participant.id);
      }

      // Define all BPMN 2.0 element selectors
      const elementSelectors = {
        startEvent: 'bpmn2\\:startEvent, bpmn\\:startEvent, startEvent',
        endEvent: 'bpmn2\\:endEvent, bpmn\\:endEvent, endEvent',
        intermediateThrowEvent: 'bpmn2\\:intermediateThrowEvent, bpmn\\:intermediateThrowEvent, intermediateThrowEvent',
        intermediateCatchEvent: 'bpmn2\\:intermediateCatchEvent, bpmn\\:intermediateCatchEvent, intermediateCatchEvent',
        boundaryEvent: 'bpmn2\\:boundaryEvent, bpmn\\:boundaryEvent, boundaryEvent',
        task: 'bpmn2\\:task, bpmn\\:task, task',
        serviceTask: 'bpmn2\\:serviceTask, bpmn\\:serviceTask, serviceTask',
        userTask: 'bpmn2\\:userTask, bpmn\\:userTask, userTask',
        scriptTask: 'bpmn2\\:scriptTask, bpmn\\:scriptTask, scriptTask',
        businessRuleTask: 'bpmn2\\:businessRuleTask, bpmn\\:businessRuleTask, businessRuleTask',
        sendTask: 'bpmn2\\:sendTask, bpmn\\:sendTask, sendTask',
        receiveTask: 'bpmn2\\:receiveTask, bpmn\\:receiveTask, receiveTask',
        manualTask: 'bpmn2\\:manualTask, bpmn\\:manualTask, manualTask',
        subProcess: 'bpmn2\\:subProcess, bpmn\\:subProcess, subProcess',
        callActivity: 'bpmn2\\:callActivity, bpmn\\:callActivity, callActivity',
        exclusiveGateway: 'bpmn2\\:exclusiveGateway, bpmn\\:exclusiveGateway, exclusiveGateway',
        inclusiveGateway: 'bpmn2\\:inclusiveGateway, bpmn\\:inclusiveGateway, inclusiveGateway',
        parallelGateway: 'bpmn2\\:parallelGateway, bpmn\\:parallelGateway, parallelGateway',
        eventBasedGateway: 'bpmn2\\:eventBasedGateway, bpmn\\:eventBasedGateway, eventBasedGateway',
        complexGateway: 'bpmn2\\:complexGateway, bpmn\\:complexGateway, complexGateway',
        dataObject: 'bpmn2\\:dataObject, bpmn\\:dataObject, dataObject',
        dataObjectReference: 'bpmn2\\:dataObjectReference, bpmn\\:dataObjectReference, dataObjectReference',
        dataStore: 'bpmn2\\:dataStore, bpmn\\:dataStore, dataStore',
        dataStoreReference: 'bpmn2\\:dataStoreReference, bpmn\\:dataStoreReference, dataStoreReference',
        group: 'bpmn2\\:group, bpmn\\:group, group',
        textAnnotation: 'bpmn2\\:textAnnotation, bpmn\\:textAnnotation, textAnnotation'
      };

      // Parse all element types within this process
      Object.entries(elementSelectors).forEach(([elementType, selector]) => {
        const elements = process.querySelectorAll(selector);

        elements.forEach(element => {
          const id = element.getAttribute('id') || `${elementType}_${nodeCounter++}`;
          let name = element.getAttribute('name') || '';
          let position = shapeMap[id] || { x: 100 + (nodeCounter * 50), y: 100 };
          const originalAttributes = getAttributesMap(element);
          const docEls = element.querySelectorAll('documentation');
          const originalDocumentation = Array.from(docEls).map(d => d.textContent || '');
          const originalNestedElements = captureNestedElements(element);

          // Find which lane this element belongs to
          let containingLane = null;
          Object.values(laneMap).forEach(lane => {
            if (lane.flowNodeRefs.includes(id)) {
              containingLane = lane;
            }
          });

          // Convert absolute coordinates to relative coordinates when using parentNode
          let finalPosition = { x: position.x, y: position.y };

          if (containingLane && participant) {
            finalPosition.x = position.x - participantBounds.x;
            finalPosition.y = position.y - participantBounds.y;

            // Ensure minimum padding from participant header and lane area
            if (finalPosition.x < 80) {
              finalPosition.x = 80;
            }
            if (finalPosition.y < 30) {
              finalPosition.y = 30;
            }

          } else if (participant && participantBounds) {
            finalPosition.x = position.x - participantBounds.x;
            finalPosition.y = position.y - participantBounds.y;

            // Ensure minimum padding
            if (finalPosition.x < 80) {
              finalPosition.x = 80;
            }
            if (finalPosition.y < 30) {
              finalPosition.y = 30;
            }
          }

          // Set default names based on element type
          if (!name) {
            const typeNames = {
              startEvent: 'Start',
              endEvent: 'End',
              intermediateThrowEvent: 'Intermediate Event',
              intermediateCatchEvent: 'Intermediate Event',
              boundaryEvent: 'Boundary Event',
              task: 'Task',
              serviceTask: 'Service Task',
              userTask: 'User Task',
              scriptTask: 'Script Task',
              businessRuleTask: 'Business Rule Task',
              sendTask: 'Send Task',
              receiveTask: 'Receive Task',
              manualTask: 'Manual Task',
              subProcess: 'Sub Process',
              callActivity: 'Call Activity',
              exclusiveGateway: 'Exclusive Gateway',
              inclusiveGateway: 'Inclusive Gateway',
              parallelGateway: 'Parallel Gateway',
              eventBasedGateway: 'Event Gateway',
              complexGateway: 'Complex Gateway',
              dataObject: 'Data Object',
              dataObjectReference: 'Data Object',
              dataStore: 'Data Store',
              dataStoreReference: 'Data Store',
              group: 'Group',
              textAnnotation: 'Annotation'
            };
            name = typeNames[elementType] || elementType.charAt(0).toUpperCase() + elementType.slice(1);
          }

          // Determine the React Flow node type
          let nodeType = elementType;

          // Map specific BPMN types to our React Flow node types
          if (['task', 'serviceTask', 'userTask', 'scriptTask', 'businessRuleTask',
            'sendTask', 'receiveTask', 'manualTask'].includes(elementType)) {
            nodeType = 'task';
          } else if (['exclusiveGateway', 'inclusiveGateway', 'parallelGateway',
            'eventBasedGateway', 'complexGateway'].includes(elementType)) {
            nodeType = 'gateway';
          } else if (['intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent'].includes(elementType)) {
            nodeType = 'intermediateEvent';
          } else if (['dataObject', 'dataObjectReference'].includes(elementType)) {
            nodeType = 'dataObject';
          } else if (['dataStore', 'dataStoreReference'].includes(elementType)) {
            nodeType = 'dataStore';
          }

          // Create node data with lane information and preserve original metadata
          const nodeData = {
            label: name,
            taskType: elementType, // Add taskType to preserve the original BPMN element type
            processId: processId,
            participantId: participant?.id,
            laneId: containingLane?.id,
            laneName: containingLane?.name,
            // Store original metadata for preservation during export
            originalProcessId: processId,
            originalIsExecutable: process.getAttribute('isExecutable'),
            originalShapeId: shapeMap[id]?.shapeId,
            originalBounds: shapeMap[id] ? {
              x: shapeMap[id].x,
              y: shapeMap[id].y,
              width: shapeMap[id].width,
              height: shapeMap[id].height
            } : undefined,
            originalLabelBounds: shapeMap[id]?.labelBounds,
            originalAttributes,
            originalDocumentation,
            documentation: originalDocumentation.length > 0 ? originalDocumentation[0] : '', // Use only first documentation element
            originalNestedElements,
            // Add color information from BPMN shapes
            backgroundColor: shapeMap[id]?.backgroundColor,
            borderColor: shapeMap[id]?.borderColor,
            // Store original extension elements from diagram for preservation
            originalDiagramExtensionElements: shapeMap[id]?.originalExtensionElements
          };

          // Check for duplicate node IDs before adding
          const existingNode = nodes.find(n => n.id === id);
          if (existingNode) {
            console.warn(`Duplicate node ID detected: ${id}. Skipping duplicate element.`);
            return; // Skip this duplicate node
          }

          const node = {
            id,
            type: nodeType,
            position: { x: finalPosition.x, y: finalPosition.y },
            data: nodeData
          };

          // Set parent relationship
          if (participant) {
            node.parentNode = participant.id;
            node.extent = 'parent';
          }

          nodes.push(node);
        });
      });

      // Parse sequence flows within this process
      const sequenceFlows = process.querySelectorAll('bpmn2\\:sequenceFlow, bpmn\\:sequenceFlow, sequenceFlow');
      sequenceFlows.forEach(element => {
        const id = element.getAttribute('id') || `sequenceFlow_${edgeCounter++}`;
        const sourceRef = element.getAttribute('sourceRef');
        const targetRef = element.getAttribute('targetRef');
        const originalAttributes = getAttributesMap(element);
        const docEls = element.querySelectorAll('documentation');
        const originalDocumentation = Array.from(docEls).map(d => d.textContent || '');
        const originalNestedElements = captureNestedElements(element);

        if (sourceRef && targetRef) {
          // Check for duplicate edge IDs before adding
          const existingEdge = edges.find(e => e.id === id);
          if (existingEdge) {
            console.warn(`Duplicate edge ID detected: ${id}. Skipping duplicate sequence flow.`);
            return; // Skip this duplicate edge
          }

          // Find original edge info from diagram
          const edgeInfo = edgeShapeMap[id];
          const originalEdgeShapeId = edgeInfo?.shapeId || `${id}_di`;

          edges.push({
            id,
            source: sourceRef,
            target: targetRef,
            type: 'smoothstep', // Use smoothstep type for smooth curved lines
            label: element.getAttribute('name') || '',
            data: {
              originalEdgeShapeId: originalEdgeShapeId,
              originalWaypoints: edgeInfo?.waypoints,
              originalLabelBounds: edgeInfo?.labelBounds,
              originalAttributes,
              originalDocumentation,
              documentation: originalDocumentation.length > 0 ? originalDocumentation[0] : '', // Use only first documentation element
              originalNestedElements
            }
          });
        }
      });
    });

    // Parse message flows from collaboration
    if (collaboration) {
      const messageFlows = collaboration.querySelectorAll('bpmn2\\:messageFlow, bpmn\\:messageFlow, messageFlow');
      messageFlows.forEach(element => {
        const id = element.getAttribute('id') || `messageFlow_${edgeCounter++}`;
        const sourceRef = element.getAttribute('sourceRef');
        const targetRef = element.getAttribute('targetRef');
        const originalAttributes = getAttributesMap(element);
        const docEls = element.querySelectorAll('documentation');
        const originalDocumentation = Array.from(docEls).map(d => d.textContent || '');

        if (sourceRef && targetRef) {
          // Check for duplicate message flow IDs before adding
          const existingEdge = edges.find(e => e.id === id);
          if (existingEdge) {
            console.warn(`Duplicate edge ID detected: ${id}. Skipping duplicate message flow.`);
            return; // Skip this duplicate edge
          }

          const sourceNode = nodes.find(n => n.id === sourceRef);
          const targetNode = nodes.find(n => n.id === targetRef);

          if (sourceNode && targetNode &&
            sourceNode.data.participantId !== targetNode.data.participantId) {
            const edgeInfo = edgeShapeMap[id];
            edges.push({
              id,
              source: sourceRef,
              target: targetRef,
              type: 'smoothstep',
              className: 'message-flow',
              label: element.getAttribute('name') || '',
              data: {
                isMessageFlow: true,
                originalEdgeShapeId: edgeInfo?.shapeId,
                originalWaypoints: edgeInfo?.waypoints,
                originalLabelBounds: edgeInfo?.labelBounds,
                originalAttributes,
                originalDocumentation,
                documentation: originalDocumentation.length > 0 ? originalDocumentation[0] : '' // Use only first documentation element
              }
            });
          }
        }
      });
    }

    // Attach process-level meta back to participant nodes so generator can preserve them
    nodes.filter(n => n.type === 'participant').forEach(p => {
      const meta = processMeta[p?.data?.processRef];
      if (meta) {
        p.data.originalProcessAttributes = meta.originalAttributes;
        p.data.originalProcessDocumentation = meta.originalDocumentation;
      }
    });
    
    // For single-process workflows (no participants), attach process meta to first regular node
    const participantNodes = nodes.filter(n => n.type === 'participant');
    if (participantNodes.length === 0) {
      const regularNodes = nodes.filter(n => n.type !== 'participant' && n.type !== 'lane');
      if (regularNodes.length > 0) {
        const firstNode = regularNodes[0];
        const meta = processMeta[firstNode.data?.processId];
        if (meta) {
          firstNode.data.originalProcessAttributes = meta.originalAttributes;
          firstNode.data.originalProcessDocumentation = meta.originalDocumentation;
        }
      }
    }

    return { nodes, edges };
  } catch (error) {
    console.error('Error parsing BPMN XML:', error);
    throw new Error('Failed to parse BPMN file: ' + error.message);
  }
};
