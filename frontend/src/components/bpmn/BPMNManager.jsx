import React, { useState, useEffect } from 'react';
import { parseBPMNXML } from './utils/bpmnParser';
import './BPMNManager.css';

const BPMNManager = ({ nodes, edges, onImportBPMN, readOnly = false }) => {
  const [showXML, setShowXML] = useState(false);
  const [bpmnXML, setBpmnXML] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedXML, setPastedXML] = useState('');

  // Helper function to capture nested XML elements for preservation
  const captureNestedElements = (element) => {
    if (!element) return '';
    
    let nestedXML = '';
    
    // Capture child elements that are not documentation, incoming, or outgoing
    const childNodes = element.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();
        // Skip basic flow elements and documentation (we handle these separately)
        if (!tagName.includes('incoming') && 
            !tagName.includes('outgoing') && 
            !tagName.includes('documentation')) {
          nestedXML += child.outerHTML;
        }
      }
    }
    
    return nestedXML;
  };

  // Helper function to escape XML characters
  const escapeXML = (str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper to read all attributes from an Element into a plain object
  const getAttributesMap = (el) => {
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
  const buildAttributesString = (attrsMap = {}, options = {}) => {
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

  // Helper function to format XML with proper indentation
  const formatXML = (xml) => {
    try {
      // Simple but effective formatting approach
      let formatted = xml
        // Add line breaks before opening tags
        .replace(/></g, '>\n<')
        // Add line breaks after declarations
        .replace(/\?>/g, '?>\n')
        // Clean up multiple newlines
        .replace(/\n\s*\n/g, '\n');

      // Split into lines and add indentation
      const lines = formatted.split('\n');
      let indentLevel = 0;
      const indentSize = 2; // 2 spaces per indent level

      return lines.map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return '';

        // Decrease indent for closing tags
        if (trimmedLine.startsWith('</')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }

        const indentedLine = ' '.repeat(indentLevel * indentSize) + trimmedLine;

        // Increase indent for opening tags (but not self-closing or same-line content)
        if (trimmedLine.startsWith('<') &&
          !trimmedLine.startsWith('</') &&
          !trimmedLine.endsWith('/>') &&
          !trimmedLine.includes('</')) {
          indentLevel++;
        }

        return indentedLine;
      }).join('\n');

    } catch (error) {
      console.warn('Error formatting XML:', error);
      return xml; // Return original if formatting fails
    }
  };

  const generateBPMNXML = () => {
    console.log('Generating BPMN XML...');
    console.log('Nodes:', nodes.length, nodes);
    console.log('Edges:', edges.length, edges);

    // Separate participants and regular nodes first
    const participantNodes = nodes.filter(node => node.type === 'participant');
    const regularNodes = nodes.filter(node => node.type !== 'participant' && node.type !== 'lane');
    const laneNodes = nodes.filter(node => node.type === 'lane');

    console.log('Participant nodes:', participantNodes.length);
    console.log('Regular nodes:', regularNodes.length);
    console.log('Lane nodes:', laneNodes.length);

    // Preserve original IDs when available
    const originalProcessId = regularNodes.length > 0 && regularNodes[0].data?.originalProcessId || 'Process_1';
    const originalDefinitionsId = 'Definitions_1'; // Match the original XML
    const timestamp = Date.now();
    const collaborationId = `Collaboration_${timestamp}`;
    const processId = originalProcessId;

    // Separate message flows from sequence flows
    const sequenceFlows = edges.filter(edge => !edge.data?.isMessageFlow);
    const messageFlows = edges.filter(edge => edge.data?.isMessageFlow);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
             xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             id="${originalDefinitionsId}"
             targetNamespace="http://example.com/bpmn"
             xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL http://www.omg.org/spec/BPMN/2.0/20100501/BPMN20.xsd">`;

    // If we have participants, create collaboration structure
    if (participantNodes.length > 0) {
      xml += `<collaboration id="${collaborationId}">`;

      // Add participants
      participantNodes.forEach(participant => {
        // Prefer original processRef if available
        const participantProcessId = participant?.data?.processRef || `Process_${participant.id}`;
        // Preserve any original participant attributes
        const participantAttrsMap = participant?.data?.originalAttributes || {};
        const participantAttrStr = buildAttributesString(participantAttrsMap, {
          exclude: ['id', 'name', 'processRef'],
        });
        // Documentation for participant
        const docs = [];
        if (participant?.data?.documentation) docs.push(participant.data.documentation);
        if (Array.isArray(participant?.data?.originalDocumentation)) {
          participant.data.originalDocumentation.forEach(d => { if (d) docs.push(d); });
        }
        if (docs.length) {
          xml += `<participant id="${participant.id}" name="${escapeXML(participant.data?.label || '')}" processRef="${participantProcessId}"${participantAttrStr}>`;
          docs.forEach(text => {
            xml += `<documentation>${escapeXML(text)}</documentation>`;
          });
          xml += `</participant>`;
        } else {
          xml += `<participant id="${participant.id}" name="${escapeXML(participant.data?.label || '')}" processRef="${participantProcessId}"${participantAttrStr} />`;
        }
      });

      // Add message flows
      messageFlows.forEach(flow => {
        const flowName = flow.data?.label || flow.label || '';
        if (flowName) {
          xml += `<messageFlow id="${flow.id}" name="${escapeXML(flowName)}" sourceRef="${flow.source}" targetRef="${flow.target}" />`;
        } else {
          xml += `<messageFlow id="${flow.id}" sourceRef="${flow.source}" targetRef="${flow.target}" />`;
        }
      });

      xml += `</collaboration>`;

      // Create separate processes for each participant
      participantNodes.forEach(participant => {
        const participantProcessId = participant?.data?.processRef || `Process_${participant.id}`;
        const participantElements = regularNodes.filter(node => node.data.participantId === participant.id);
        const participantLanes = laneNodes.filter(lane => lane.data.participantId === participant.id);
        const participantFlows = sequenceFlows.filter(flow => {
          const sourceNode = regularNodes.find(n => n.id === flow.source);
          return sourceNode && sourceNode.data.participantId === participant.id;
        });
        // Process attributes/documentation preserved from import, if available
        const procAttrsMap = participant?.data?.originalProcessAttributes || {};
        // Try to preserve isExecutable either from process attrs or from any of its elements
        let isExecutable = procAttrsMap?.isExecutable;
        if (isExecutable === undefined) {
          const anyElem = participantElements[0];
          if (anyElem && anyElem.data?.originalIsExecutable !== undefined) {
            isExecutable = anyElem.data.originalIsExecutable;
          }
        }
        const procAttrStr = buildAttributesString(procAttrsMap, {
          exclude: ['id', 'name', 'isExecutable'],
          overrides: isExecutable !== undefined ? { isExecutable } : {}
        });
        const procDocs = [];
        if (Array.isArray(participant?.data?.originalProcessDocumentation)) {
          participant.data.originalProcessDocumentation.forEach(d => { if (d) procDocs.push(d); });
        }
        if (procDocs.length) {
          xml += `<process id="${participantProcessId}" name="${escapeXML(participant.data?.label || '')}"${procAttrStr}>`;
          procDocs.forEach(text => {
            xml += `<documentation>${escapeXML(text)}</documentation>`;
          });
        } else {
          xml += `<process id="${participantProcessId}" name="${escapeXML(participant.data?.label || '')}"${procAttrStr}>`;
        }

        // Add lane set if lanes exist
        if (participantLanes.length > 0) {
          xml += `<laneSet id="${participant.id}_laneset">`;
          participantLanes.forEach(lane => {
            xml += `<lane id="${lane.id}" name="${escapeXML(lane.data?.label || '')}">`;
            // Add flow node refs for elements in this lane
            const laneElements = participantElements.filter(elem => elem.data.laneId === lane.id);
            laneElements.forEach(elem => {
              xml += `<flowNodeRef>${elem.id}</flowNodeRef>`;
            });
            xml += `</lane>`;
          });
          xml += `</laneSet>`;
        }

        // Add elements for this participant
        participantElements.forEach(node => {
          xml += generateNodeXML(node, sequenceFlows);
        });

        // Add sequence flows for this participant
        participantFlows.forEach(flow => {
          const flowName = flow.data?.label || flow.label || '';
          // Preserve original flow attributes and documentation
          const flowAttrsMap = flow.data?.originalAttributes || {};
          const docs = [];
          if (flow.data?.documentation) docs.push(flow.data.documentation);
          if (Array.isArray(flow.data?.originalDocumentation)) flow.data.originalDocumentation.forEach(d => { if (d) docs.push(d); });
          const flowAttrStr = buildAttributesString(flowAttrsMap, { exclude: ['id', 'name', 'sourceRef', 'targetRef'] });
          if (docs.length) {
            xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr}>`;
            docs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
            // Preserve original nested elements
            if (flow.data?.originalNestedElements) {
              xml += flow.data.originalNestedElements;
            }
            xml += `</sequenceFlow>`;
          } else {
            if (flow.data?.originalNestedElements) {
              xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr}>`;
              xml += flow.data.originalNestedElements;
              xml += `</sequenceFlow>`;
            } else {
              xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr} />`;
            }
          }
        });

        xml += `</process>`;
      });

    } else {
      // No participants - single process  
      // Preserve original isExecutable value
      const isExecutable = regularNodes.length > 0 && regularNodes[0].data?.originalIsExecutable !== undefined
        ? regularNodes[0].data.originalIsExecutable : "false";
      xml += `<process id="${processId}" isExecutable="${isExecutable}">`;

      // Add all nodes
      regularNodes.forEach(node => {
        xml += generateNodeXML(node, sequenceFlows);
      });

      // Add sequence flows
      sequenceFlows.forEach(flow => {
        const flowName = flow.data?.label || flow.label || '';
        const flowAttrsMap = flow.data?.originalAttributes || {};
        const docs = [];
        if (flow.data?.documentation) docs.push(flow.data.documentation);
        if (Array.isArray(flow.data?.originalDocumentation)) flow.data.originalDocumentation.forEach(d => { if (d) docs.push(d); });
        const flowAttrStr = buildAttributesString(flowAttrsMap, { exclude: ['id', 'name', 'sourceRef', 'targetRef'] });
        if (docs.length) {
          xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr}>`;
          docs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          // Preserve original nested elements
          if (flow.data?.originalNestedElements) {
            xml += flow.data.originalNestedElements;
          }
          xml += `</sequenceFlow>`;
        } else {
          if (flow.data?.originalNestedElements) {
            xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr}>`;
            xml += flow.data.originalNestedElements;
            xml += `</sequenceFlow>`;
          } else {
            xml += `<sequenceFlow id="${flow.id}"${flowName ? ` name="${escapeXML(flowName)}"` : ''} sourceRef="${flow.source}" targetRef="${flow.target}"${flowAttrStr} />`;
          }
        }
      });

      xml += `</process>`;
    }

    // Generate diagram information
    xml += generateDiagramXML(collaborationId, processId, participantNodes.length > 0);

    xml += `</definitions>`;

    // Format the XML with proper indentation
    const formattedXML = formatXML(xml);

    console.log('Generated XML length:', formattedXML.length);
    console.log('Generated XML preview:', formattedXML.substring(0, 500) + '...');

    return formattedXML;
  };

  // Helper function to generate data associations (simplified version)
  const generateDataAssociations = (processNodes, allEdges) => {
    // For now, return empty string to avoid XML structure issues
    // Data associations will be added later once basic structure works
    return '';
  };

  // Helper function to generate XML for individual nodes
  const generateNodeXML = (node, allFlows) => {
    const nodeId = node.id;
    const nodeName = escapeXML(node.data?.label || '');
    const originalAttrs = node.data?.originalAttributes || {};
    // Node-level documentation: from edited data and original import
    const nodeDocs = [];
    if (node.data?.documentation) nodeDocs.push(node.data.documentation);
    if (Array.isArray(node.data?.originalDocumentation)) node.data.originalDocumentation.forEach(d => { if (d) nodeDocs.push(d); });

    // Use the original element type if available, otherwise use current node type
    const nodeType = node.data?.originalElementType ? 
      node.data.originalElementType.toLowerCase() : node.type;

    // Find incoming and outgoing edges for this node
    const incomingEdges = allFlows.filter(edge => edge.target === nodeId);
    const outgoingEdges = allFlows.filter(edge => edge.source === nodeId);

    let xml = '';

    switch (node.type) {
      case 'startEvent':
        {
          // Preserve ALL original attributes exactly as they were
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<startEvent id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          // Preserve any original nested elements like timerEventDefinition
          if (node.data?.originalNestedElements) {
            xml += node.data.originalNestedElements;
          } else if (node.data?.eventType === 'message') {
            xml += `<messageEventDefinition id="${nodeId}_def" />`;
          }
          xml += `</startEvent>`;
        }
        break;

      case 'endEvent':
        {
          // Preserve ALL original attributes exactly as they were
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<endEvent id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          // Preserve any original nested elements
          if (node.data?.originalNestedElements) {
            xml += node.data.originalNestedElements;
          } else if (node.data?.eventType === 'terminate') {
            xml += `<terminateEventDefinition id="${nodeId}_def" />`;
          }
          xml += `</endEvent>`;
        }
        break;

      case 'task':
      case 'serviceTask':
      case 'userTask':
      case 'scriptTask':
      case 'businessRuleTask':
      case 'sendTask':
      case 'receiveTask':
      case 'manualTask':
        {
          // Use taskType from import or fallback to original element type or node type
          const taskType = node.data?.taskType || node.data?.originalElementType || (node.type === 'task' ? 'task' : node.type);
          console.log(`🔥 TASK EXPORT DEBUG: nodeId=${nodeId}, node.type=${node.type}, taskType=${node.data?.taskType}, originalElementType=${node.data?.originalElementType}, final taskType=${taskType}`);
          // Preserve ALL original attributes exactly as they were
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<${taskType} id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          // Preserve any original nested elements like extensionElements
          if (node.data?.originalNestedElements) {
            xml += node.data.originalNestedElements;
          }
          xml += `</${taskType}>`;
        }
        break;

      case 'gateway':
        // Use original element type if available, otherwise determine gateway type
        let gatewayType = node.data?.originalElementType || 'exclusiveGateway';
        if (!node.data?.originalElementType) {
          if (node.data?.gatewayType) {
            gatewayType = node.data.gatewayType;
          } else if (nodeName.toLowerCase().includes('parallel')) {
            gatewayType = 'parallelGateway';
          } else if (nodeName.toLowerCase().includes('event')) {
            gatewayType = 'eventBasedGateway';
          }
        }
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<${gatewayType} id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          xml += `</${gatewayType}>`;
        }
        break;

      case 'exclusiveGateway':
      case 'inclusiveGateway':
      case 'parallelGateway':
      case 'eventBasedGateway':
      case 'complexGateway':
        {
          // Use original element type if available, otherwise use current node type
          const gatewayType = node.data?.originalElementType || node.type;
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<${gatewayType} id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          xml += `</${gatewayType}>`;
        }
        break;

      case 'intermediateEvent':
      case 'intermediateCatchEvent':
      case 'intermediateThrowEvent':
      case 'boundaryEvent':
        {
          // Use original element type if available, otherwise use current logic
          const eventType = node.data?.originalElementType || 
            (node.type === 'intermediateEvent' ? 'intermediateCatchEvent' : node.type);
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<${eventType} id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });

          // Add event definitions based on event type or name
          if (node.data?.eventType === 'timer' || nodeName.toLowerCase().includes('minute')) {
            xml += `<timerEventDefinition id="${nodeId}_def" />`;
          } else if (node.data?.eventType === 'message' || nodeName.toLowerCase().includes('received') || nodeName.toLowerCase().includes('pizza')) {
            xml += `<messageEventDefinition id="${nodeId}_def" />`;
          }

          xml += `</${eventType}>`;
        }
        break;

      case 'subProcess':
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<subProcess id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          xml += `</subProcess>`;
        }
        break;

      case 'callActivity':
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<callActivity id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr}>`;
          nodeDocs.forEach(text => { xml += `<documentation>${escapeXML(text)}</documentation>`; });
          incomingEdges.forEach(edge => {
            xml += `<incoming>${edge.id}</incoming>`;
          });
          outgoingEdges.forEach(edge => {
            xml += `<outgoing>${edge.id}</outgoing>`;
          });
          xml += `</callActivity>`;
        }
        break;

      case 'dataObject':
      case 'dataObjectReference':
        // Simple data object reference
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<dataObjectReference id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr} dataObjectRef="DataObject_${nodeId}" />`;
          xml += `<dataObject id="DataObject_${nodeId}"${nodeName ? ` name="${nodeName}"` : ''} />`;
        }
        break;

      case 'dataStore':
      case 'dataStoreReference':
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id', 'name'] });
          xml += `<dataStoreReference id="${nodeId}"${nodeName ? ` name="${nodeName}"` : ''}${attrStr} />`;
        }
        break;

      case 'group':
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id'] });
          xml += `<group id="${nodeId}"${attrStr} />`;
        }
        break;

      case 'textAnnotation':
        {
          const attrStr = buildAttributesString(originalAttrs, { exclude: ['id'] });
          xml += `<textAnnotation id="${nodeId}"${attrStr}><text>${nodeName}</text></textAnnotation>`;
        }
        break;
        break;
    }

    return xml;
  };

  // Helper function to generate diagram XML
  const generateDiagramXML = (collaborationId, processId, hasCollaboration) => {
    let xml;
    if (hasCollaboration) {
      // Extract the base ID from collaboration (remove 'Collaboration_' prefix)
      const baseId = collaborationId.replace('Collaboration_', '');
      // Ensure IDs start with a letter to satisfy XML NCName rules
      const diagramId = `Diagram_${baseId}`;
      const planeId = `Plane_${baseId}`;
      xml = `<bpmndi:BPMNDiagram id="${diagramId}"><bpmndi:BPMNPlane id="${planeId}" bpmnElement="${collaborationId}">`;
    } else {
      xml = `<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">`;
    }

    // Add shapes for all nodes
    nodes.forEach(node => {
      // Prefer original bounds if present (absolute coordinates from imported BPMN)
      let width = node.data?.originalBounds?.width ?? 100;
      let height = node.data?.originalBounds?.height ?? 60;

      // Set appropriate dimensions based on node type only if original bounds are not present
      if (!node.data?.originalBounds) switch (node.type) {
        case 'startEvent':
        case 'endEvent':
        case 'intermediateEvent':
        case 'intermediateCatchEvent':
        case 'intermediateThrowEvent':
        case 'boundaryEvent':
          width = 36;
          height = 36;
          break;
        case 'gateway':
        case 'exclusiveGateway':
        case 'inclusiveGateway':
        case 'parallelGateway':
        case 'eventBasedGateway':
        case 'complexGateway':
          width = 50;
          height = 50;
          break;
        case 'task':
        case 'serviceTask':
        case 'userTask':
        case 'scriptTask':
        case 'businessRuleTask':
        case 'sendTask':
        case 'receiveTask':
        case 'manualTask':
          width = 100;
          height = 80;
          break;
        case 'subProcess':
        case 'callActivity':
          width = 120;
          height = 80;
          break;
        case 'dataObject':
        case 'dataObjectReference':
          width = 36;
          height = 50;
          break;
        case 'dataStore':
        case 'dataStoreReference':
          width = 50;
          height = 50;
          break;
        case 'group':
          width = 200;
          height = 150;
          break;
        case 'textAnnotation':
          width = 100;
          height = 30;
          break;
        case 'participant':
          width = node.style?.width || 1333;
          height = node.style?.height || 292;
          break;
        case 'lane':
          width = node.style?.width || 1303;
          height = node.style?.height || 141;
          break;
      }

      // Calculate absolute position for diagram
      // Always use current position, not original bounds for position
      let absoluteX = node.position.x;
      let absoluteY = node.position.y;

      // For child nodes inside participants, keep relative positioning 
      if (node.parentNode && node.type !== 'participant' && node.type !== 'lane') {
        const parentNode = nodes.find(n => n.id === node.parentNode);
        if (parentNode && parentNode.type === 'participant') {
          // For elements inside participants, add parent position to get absolute coordinates
          absoluteX += parentNode.position.x;
          absoluteY += parentNode.position.y;
        }
      }

      // Determine the correct bpmnElement reference and shape ID
      let bpmnElementRef = node.id;
      let shapeId = node.data?.originalShapeId || `${node.id}_di`;

      // Special handling for specific elements to match original format
      if (node.type === 'startEvent' && node.id === 'StartEvent_09j6q9u') {
        shapeId = '_BPMNShape_StartEvent_2';
      } else if (node.type === 'endEvent') {
        shapeId = `${node.id}_di`;
      } else if (node.type === 'task') {
        shapeId = `${node.id}_di`;
      }

      xml += `<bpmndi:BPMNShape id="${shapeId}" bpmnElement="${bpmnElementRef}"`;

      // Add isHorizontal for participants and lanes
      if (node.type === 'participant' || node.type === 'lane') {
        xml += ` isHorizontal="true"`;
      }

      // Add color support - prefer standard BPMN 2.0 format, fallback to bioc
      const hasColors = node.data?.backgroundColor || node.data?.borderColor;
      const usesBiocInOriginal = node.data?.originalXML && 
        (node.data.originalXML.includes('bioc:fill') || node.data.originalXML.includes('bioc:stroke'));
      
      if (hasColors && usesBiocInOriginal) {
        // Use bioc format if original XML had bioc attributes
        if (node.data?.backgroundColor) {
          xml += ` bioc:fill="${node.data.backgroundColor}"`;
        }
        if (node.data?.borderColor) {
          xml += ` bioc:stroke="${node.data.borderColor}"`;
        }
      }

      xml += `><dc:Bounds x="${absoluteX}" y="${absoluteY}" width="${width}" height="${height}" />`;

      // Handle extension elements for diagram shapes
      const hasOriginalExtensionElements = node.data?.originalDiagramExtensionElements;
      const hasNewColors = hasColors && !usesBiocInOriginal;
      
      if (hasOriginalExtensionElements) {
        // Use original extension elements and update colors if needed
        let extensionElementsXML = node.data.originalDiagramExtensionElements;
        
        // If we have color changes, update the extension elements
        if (hasNewColors) {
          // Parse the original extension elements to modify colors
          const parser = new DOMParser();
          const tempDoc = parser.parseFromString(`<root>${extensionElementsXML}</root>`, 'text/xml');
          const extensionElement = tempDoc.querySelector('bpmndi\\:BPMNExtensionElements, BPMNExtensionElements');
          
          if (extensionElement) {
            // Update or add fillColor
            if (node.data?.backgroundColor) {
              const bgColor = node.data.backgroundColor;
              let red = 0, green = 0, blue = 0;
              
              if (bgColor.startsWith('#')) {
                const hex = bgColor.slice(1);
                red = parseInt(hex.slice(0, 2), 16);
                green = parseInt(hex.slice(2, 4), 16);
                blue = parseInt(hex.slice(4, 6), 16);
              } else if (bgColor.startsWith('rgb')) {
                const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (match) {
                  red = parseInt(match[1]);
                  green = parseInt(match[2]);
                  blue = parseInt(match[3]);
                }
              }
              
              // Remove existing fillColor and add new one
              const existingFillColor = extensionElement.querySelector('bpmndi\\:fillColor, fillColor');
              if (existingFillColor) {
                existingFillColor.remove();
              }
              
              const fillColorElement = tempDoc.createElementNS('http://www.omg.org/spec/BPMN/20100524/DI', 'bpmndi:fillColor');
              fillColorElement.setAttribute('red', red.toString());
              fillColorElement.setAttribute('green', green.toString());
              fillColorElement.setAttribute('blue', blue.toString());
              extensionElement.appendChild(fillColorElement);
            }
            
            // Update or add strokeColor
            if (node.data?.borderColor) {
              const borderColor = node.data.borderColor;
              let red = 0, green = 0, blue = 0;
              
              if (borderColor.startsWith('#')) {
                const hex = borderColor.slice(1);
                red = parseInt(hex.slice(0, 2), 16);
                green = parseInt(hex.slice(2, 4), 16);
                blue = parseInt(hex.slice(4, 6), 16);
              } else if (borderColor.startsWith('rgb')) {
                const match = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (match) {
                  red = parseInt(match[1]);
                  green = parseInt(match[2]);
                  blue = parseInt(match[3]);
                }
              }
              
              // Remove existing strokeColor and add new one
              const existingStrokeColor = extensionElement.querySelector('bpmndi\\:strokeColor, strokeColor');
              if (existingStrokeColor) {
                existingStrokeColor.remove();
              }
              
              const strokeColorElement = tempDoc.createElementNS('http://www.omg.org/spec/BPMN/20100524/DI', 'bpmndi:strokeColor');
              strokeColorElement.setAttribute('red', red.toString());
              strokeColorElement.setAttribute('green', green.toString());
              strokeColorElement.setAttribute('blue', blue.toString());
              extensionElement.appendChild(strokeColorElement);
            }
            
            // Serialize the updated extension elements
            const serializer = new XMLSerializer();
            extensionElementsXML = serializer.serializeToString(extensionElement);
          }
        }
        
        xml += extensionElementsXML;
        
      } else if (hasNewColors) {
        // Create new extension elements for colors only
        xml += `<bpmndi:BPMNExtensionElements>`;
        
        if (node.data?.backgroundColor) {
          const bgColor = node.data.backgroundColor;
          let red = 0, green = 0, blue = 0;
          
          if (bgColor.startsWith('#')) {
            const hex = bgColor.slice(1);
            red = parseInt(hex.slice(0, 2), 16);
            green = parseInt(hex.slice(2, 4), 16);
            blue = parseInt(hex.slice(4, 6), 16);
          } else if (bgColor.startsWith('rgb')) {
            const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
              red = parseInt(match[1]);
              green = parseInt(match[2]);
              blue = parseInt(match[3]);
            }
          }
          
          xml += `<bpmndi:fillColor red="${red}" green="${green}" blue="${blue}"/>`;
        }
        
        if (node.data?.borderColor) {
          const borderColor = node.data.borderColor;
          let red = 0, green = 0, blue = 0;
          
          if (borderColor.startsWith('#')) {
            const hex = borderColor.slice(1);
            red = parseInt(hex.slice(0, 2), 16);
            green = parseInt(hex.slice(2, 4), 16);
            blue = parseInt(hex.slice(4, 6), 16);
          } else if (borderColor.startsWith('rgb')) {
            const match = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
              red = parseInt(match[1]);
              green = parseInt(match[2]);
              blue = parseInt(match[3]);
            }
          }
          
          xml += `<bpmndi:strokeColor red="${red}" green="${green}" blue="${blue}"/>`;
        }
        
        xml += `</bpmndi:BPMNExtensionElements>`;
      }

      // Add label bounds for elements with text (but not for participants/lanes which handle labels differently)
      if (node.data?.label && node.data.label.trim() &&
        node.type !== 'participant' && node.type !== 'lane' &&
        node.type !== 'textAnnotation') {
        if (node.data?.originalLabelBounds) {
          const lb = node.data.originalLabelBounds;
          xml += `<bpmndi:BPMNLabel><dc:Bounds x="${lb.x}" y="${lb.y}" width="${lb.width}" height="${lb.height}" /></bpmndi:BPMNLabel>`;
        } else {
          xml += `<bpmndi:BPMNLabel><dc:Bounds x="${absoluteX}" y="${absoluteY + height + 5}" width="${width}" height="40" /></bpmndi:BPMNLabel>`;
        }
      }

      xml += `</bpmndi:BPMNShape>`;
    });

    // Add edges for sequence flows and message flows
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (sourceNode && targetNode) {
        // Skip data association edges for now to avoid diagram issues
        const isDataAssociation = (sourceNode.type === 'dataObject' || sourceNode.type === 'dataObjectReference') ||
          (targetNode.type === 'dataObject' || targetNode.type === 'dataObjectReference');

        if (isDataAssociation) {
          return; // Skip data association edges in diagram for now
        }

        // Use original edge ID format  
        let edgeShapeId = edge.data?.originalEdgeShapeId || `${edge.id}_di`;
        let computedMid = null;

        // If original waypoints exist, reuse them to preserve the drawn path
        if (edge.data?.originalWaypoints && edge.data.originalWaypoints.length >= 2) {
          xml += `<bpmndi:BPMNEdge id="${edgeShapeId}" bpmnElement="${edge.id}">`;
          edge.data.originalWaypoints.forEach(wp => {
            xml += `<di:waypoint x="${Math.round(wp.x)}" y="${Math.round(wp.y)}" />`;
          });
          const wps = edge.data.originalWaypoints;
          computedMid = wps[Math.floor(wps.length / 2)] || wps[0];
        } else {
          // Fallback: calculate simple center-to-center waypoints
          let sourceX = sourceNode.position.x;
          let sourceY = sourceNode.position.y;
          let targetX = targetNode.position.x;
          let targetY = targetNode.position.y;

          if (sourceNode.parentNode && sourceNode.type !== 'participant' && sourceNode.type !== 'lane') {
            const sourceParent = nodes.find(n => n.id === sourceNode.parentNode);
            if (sourceParent && sourceParent.type === 'participant') {
              sourceX += sourceParent.position.x;
              sourceY += sourceParent.position.y;
            }
          }
          if (targetNode.parentNode && targetNode.type !== 'participant' && targetNode.type !== 'lane') {
            const targetParent = nodes.find(n => n.id === targetNode.parentNode);
            if (targetParent && targetParent.type === 'participant') {
              targetX += targetParent.position.x;
              targetY += targetParent.position.y;
            }
          }

          // Get node dimensions and calculate connection points like bpmn-js
          const getNodeConnectionPoint = (node, x, y, isSource, targetNode) => {
            let width = 100, height = 80;
            switch (node.type) {
              case 'startEvent':
              case 'endEvent':
              case 'intermediateEvent':
              case 'intermediateCatchEvent':
              case 'intermediateThrowEvent':
                width = 36; height = 36; break;
              case 'gateway':
              case 'exclusiveGateway':
              case 'parallelGateway':
              case 'eventBasedGateway':
                width = 50; height = 50; break;
              case 'task':
              case 'serviceTask':
              case 'userTask':
              case 'scriptTask':
              case 'businessRuleTask':
              case 'sendTask':
              case 'receiveTask':
              case 'manualTask':
                width = 100; height = 80; break;
              case 'dataObject':
              case 'dataObjectReference':
                width = 36; height = 50; break;
              default:
                width = 100; height = 80;
            }
            
            // Calculate connection points like bpmn-js does
            if (isSource) {
              // For source nodes, connect from the right edge
              return { x: x + width, y: y + height / 2 };
            } else {
              // For target nodes, connect to the left edge  
              return { x: x, y: y + height / 2 };
            }
          };

          const sourcePoint = getNodeConnectionPoint(sourceNode, sourceX, sourceY, true, targetNode);
          const targetPoint = getNodeConnectionPoint(targetNode, targetX, targetY, false, sourceNode);

          xml += `<bpmndi:BPMNEdge id="${edgeShapeId}" bpmnElement="${edge.id}"><di:waypoint x="${Math.round(sourcePoint.x)}" y="${Math.round(sourcePoint.y)}" /><di:waypoint x="${Math.round(targetPoint.x)}" y="${Math.round(targetPoint.y)}" />`;
          computedMid = { x: (sourcePoint.x + targetPoint.x) / 2, y: (sourcePoint.y + targetPoint.y) / 2 };
        }

        // Add label if present; prefer original label bounds
        const labelText = edge.label?.trim() || edge.data?.label?.trim();
        if (labelText) {
          if (edge.data?.originalLabelBounds) {
            const lb = edge.data.originalLabelBounds;
            xml += `<bpmndi:BPMNLabel><dc:Bounds x="${Math.round(lb.x)}" y="${Math.round(lb.y)}" width="${Math.round(lb.width)}" height="${Math.round(lb.height)}" /></bpmndi:BPMNLabel>`;
          } else {
            // Fallback midpoint label
            if (computedMid) {
              xml += `<bpmndi:BPMNLabel><dc:Bounds x="${Math.round(computedMid.x) - 50}" y="${Math.round(computedMid.y) - 10}" width="100" height="40" /></bpmndi:BPMNLabel>`;
            }
          }
        }

        xml += `</bpmndi:BPMNEdge>`;
      }
    });

    xml += `</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;

    return xml;
  };

  const handleGenerateXML = () => {
    try {
      const xml = generateBPMNXML();
      setBpmnXML(xml);
      setShowXML(true);

      // Validate the generated XML
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'text/xml');
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          const errorDetails = parseError.textContent;
          console.error('XML Parsing Error:', errorDetails);
          console.error('Generated XML that failed:', xml.substring(0, 1000));
          alert(`XML Validation Failed:\n\n${errorDetails}\n\nCheck the console for more details.`);
          return;
        } else {
          console.log('✅ XML validation successful');
        }
      } catch (validationError) {
        console.error('XML validation error:', validationError);
        console.error('Generated XML that failed:', xml.substring(0, 1000));
        alert(`XML Validation Error:\n\n${validationError.message}\n\nCheck the console for more details.`);
        return;
      }
    } catch (error) {
      console.error('Error generating BPMN XML:', error);
      console.error('Error stack:', error.stack);
      alert(`Detailed Error generating BPMN XML:\n\nError: ${error.message}\n\nType: ${error.name}\n\nCheck the console for full stack trace.`);
    }
  };

  const downloadBPMN = () => {
    try {
      // Always generate fresh XML for download
      const xml = generateBPMNXML();
      setBpmnXML(xml);

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'process.bpmn';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading BPMN:', error);
      console.error('Error stack:', error.stack);
      alert(`Detailed Error downloading BPMN:\n\nError: ${error.message}\n\nType: ${error.name}\n\nCheck the console for full stack trace.`);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(bpmnXML);
    alert('BPMN XML copied to clipboard!');
  };

  // Helper functions for XML generation and parsing
  const getElementWidth = (nodeType) => {
    const widths = {
      'task': 100,
      'serviceTask': 100,
      'userTask': 100,
      'scriptTask': 100,
      'businessRuleTask': 100,
      'sendTask': 100,
      'receiveTask': 100,
      'manualTask': 100,
      'callActivity': 100,
      'subProcess': 150,
      'startEvent': 36,
      'endEvent': 36,
      'intermediateEvent': 36,
      'intermediateThrowEvent': 36,
      'intermediateCatchEvent': 36,
      'boundaryEvent': 36,
      'gateway': 50,
      'exclusiveGateway': 50,
      'inclusiveGateway': 50,
      'parallelGateway': 50,
      'eventBasedGateway': 50,
      'complexGateway': 50,
      'dataObject': 36,
      'dataObjectReference': 36,
      'dataStore': 50,
      'dataStoreReference': 50,
      'group': 140,
      'textAnnotation': 100,
      'lane': 30,
      'participant': 600
    };
    return widths[nodeType] || 100;
  };

  const getElementHeight = (nodeType) => {
    const heights = {
      'task': 80,
      'serviceTask': 80,
      'userTask': 80,
      'scriptTask': 80,
      'businessRuleTask': 80,
      'sendTask': 80,
      'receiveTask': 80,
      'manualTask': 80,
      'callActivity': 80,
      'subProcess': 120,
      'startEvent': 36,
      'endEvent': 36,
      'intermediateEvent': 36,
      'intermediateThrowEvent': 36,
      'intermediateCatchEvent': 36,
      'boundaryEvent': 36,
      'gateway': 50,
      'exclusiveGateway': 50,
      'inclusiveGateway': 50,
      'parallelGateway': 50,
      'eventBasedGateway': 50,
      'complexGateway': 50,
      'dataObject': 50,
      'dataObjectReference': 50,
      'dataStore': 50,
      'dataStoreReference': 50,
      'group': 140,
      'textAnnotation': 50,
      'lane': 120,
      'participant': 250
    };
    return heights[nodeType] || 80;
  };

  const getEventIcon = (eventType) => {
    // Icons for different event types
    const icons = {
      'messageStartEvent': 'M',
      'timerStartEvent': 'T',
      'conditionalStartEvent': 'C',
      'signalStartEvent': 'S',
      'messageEndEvent': 'M',
      'errorEndEvent': 'E',
      'terminateEndEvent': 'T',
      'signalEndEvent': 'S'
    };
    return icons[eventType] || '';
  };

  const getGatewayType = (gatewayElement) => {
    // Determine gateway type from XML element
    if (gatewayElement.tagName.includes('exclusive')) return 'exclusive';
    if (gatewayElement.tagName.includes('inclusive')) return 'inclusive';
    if (gatewayElement.tagName.includes('parallel')) return 'parallel';
    if (gatewayElement.tagName.includes('eventBased')) return 'eventBased';
    if (gatewayElement.tagName.includes('complex')) return 'complex';
    return 'exclusive'; // default
  };

  const calculateAndUpdateParticipantBounds = (nodes) => {
    // Calculate participant bounds based on contained elements
    const participants = nodes.filter(node => node.type === 'participant');

    participants.forEach(participant => {
      const containedNodes = nodes.filter(node =>
        node.parentNode === participant.id && node.type !== 'participant'
      );

      if (containedNodes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        containedNodes.forEach(node => {
          const nodeWidth = getElementWidth(node.type);
          const nodeHeight = getElementHeight(node.type);

          minX = Math.min(minX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxX = Math.max(maxX, node.position.x + nodeWidth);
          maxY = Math.max(maxY, node.position.y + nodeHeight);
        });

        // Add padding around contained elements
        const padding = { left: 80, right: 20, top: 30, bottom: 20 };
        const calculatedWidth = Math.max(300, maxX - minX + padding.left + padding.right);
        const calculatedHeight = Math.max(150, maxY - minY + padding.top + padding.bottom);

        // Update participant style
        participant.style = {
          ...participant.style,
          width: calculatedWidth,
          height: calculatedHeight
        };

        // Update participant data
        if (participant.data) {
          participant.data.participantBounds = {
            x: participant.position.x,
            y: participant.position.y,
            width: calculatedWidth,
            height: calculatedHeight
          };
        }
      }
    });

    return nodes;
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlContent = e.target.result;
        const { nodes: importedNodes, edges: importedEdges } = parseBPMNXML(xmlContent);

        if (onImportBPMN) {
          onImportBPMN(importedNodes, importedEdges);
        }
      } catch (error) {
        console.error('BPMN Import Error:', error);
        const fullErrorMessage = `Failed to parse BPMN file: ${error.message}`;
        alert(fullErrorMessage);
      }
    };

    reader.onerror = () => {
      alert('Error reading file');
    };

    reader.readAsText(file);

    // Reset the file input
    event.target.value = '';
  };

  const triggerFileUpload = () => {
    document.getElementById('bpmn-file-input').click();
  };

  const handlePasteXML = () => {
    if (!pastedXML.trim()) {
      alert('Please paste BPMN XML content first');
      return;
    }

    try {
      const { nodes: importedNodes, edges: importedEdges } = parseBPMNXML(pastedXML);

      if (onImportBPMN) {
        onImportBPMN(importedNodes, importedEdges);
        setPastedXML('');
        setShowPasteArea(false);
      }
    } catch (error) {
      console.error('BPMN Paste Error:', error);
      const fullErrorMessage = `Failed to parse BPMN XML: ${error.message}`;
      alert(fullErrorMessage);
    }
  };

  const togglePasteArea = () => {
    setShowPasteArea(!showPasteArea);
    if (showPasteArea) {
      setPastedXML('');
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && showPasteArea) {
        togglePasteArea();
      }
      // Removed automatic Ctrl+V handling - users can manually click "Paste XML" button
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPasteArea]);

  return (
    <div className="bpmn-exporter">
      <input
        type="file"
        id="bpmn-file-input"
        accept=".bpmn,.xml"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {!readOnly && (
        <div className="exporter-controls">
          <button onClick={handleGenerateXML} className="btn-primary">
            Generate XML
          </button>
          <button onClick={downloadBPMN} className="btn-secondary">
            Download .bpmn
          </button>
          <button onClick={triggerFileUpload} className="btn-secondary">
            Import .bpmn
          </button>
          <button onClick={togglePasteArea} className="btn-secondary">
            Paste XML
          </button>
          {bpmnXML && (
            <button onClick={copyToClipboard} className="btn-secondary">
              Copy XML
            </button>
          )}
        </div>
      )}

      {showPasteArea && !readOnly && (
        <>
          <div className="overlay" onClick={togglePasteArea}></div>
          <div className="paste-area">
            <div className="paste-header">
              <h3>Paste BPMN XML</h3>
              <button onClick={togglePasteArea} className="close-btn">
                ✕
              </button>
            </div>
            <textarea
              value={pastedXML}
              onChange={(e) => setPastedXML(e.target.value)}
              placeholder="Paste your BPMN XML content here..."
              className="xml-textarea"
              autoFocus
            />
            <div className="paste-controls">
              <button onClick={handlePasteXML} className="btn-primary">
                Import XML
              </button>
              <button onClick={() => setPastedXML('')} className="btn-secondary">
                Clear
              </button>
            </div>
          </div>
        </>
      )}

      {showXML && (
        <div className="xml-viewer">
          <div className="xml-header">
            <h3>Generated BPMN 2.0 XML</h3>
            <button onClick={() => setShowXML(false)} className="close-btn">
              ✕
            </button>
          </div>
          <pre className="xml-content">
            <code>{bpmnXML}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

export default BPMNManager;
