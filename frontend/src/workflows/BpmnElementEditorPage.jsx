import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Card,
  CardContent,
} from '@mui/material';
import {
  Upload,
  Save,
  FileText,
} from 'lucide-react';
import BpmnElementEditor from '../components/BpmnElementEditor';

const BpmnElementEditorPage = () => {
  const [xmlContent, setXmlContent] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [savedXml, setSavedXml] = useState('');

  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
  xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_1"
  targetNamespace="http://example.com/bpmn"
  xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL http://www.omg.org/spec/BPMN/2.0/20100501/BPMN20.xsd">
  <process id="process_user_registration_func_ext_1" isExecutable="true">
    <startEvent id="startEvent_ur_func_ext_1" name="Start Registration">
      <outgoing>flow_ur_func_ext_1</outgoing>
    </startEvent>
    <endEvent id="endEvent_ur_func_ext_success" name="Registration Success">
      <incoming>flow_ur_func_ext_7</incoming>
    </endEvent>
    <endEvent id="endEvent_ur_func_ext_failed" name="Registration Failed">
      <incoming>flow_ur_func_ext_9</incoming>
    </endEvent>
    <serviceTask id="serviceTask_ur_func_ext_1" name="Validate Email Address">
      <incoming>flow_ur_func_ext_2</incoming>
      <outgoing>flow_ur_func_ext_3</outgoing>
      <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <serviceConfiguration xmlns="http://example.org/service">
          <function>
            <moduleName>email</moduleName>
            <functionName>validate_email</functionName>
            <parameters>
              <parameter name="email" value=""/>
            </parameters>
          </function>
        </serviceConfiguration>
      </extensionElements>
    </serviceTask>
    <userTask id="userTask_ur_func_ext_1" name="Enter Registration Details">
      <incoming>flow_ur_func_ext_1</incoming>
      <outgoing>flow_ur_func_ext_2</outgoing>
      <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <formData xmlns="http://example.org/form">
          <formField id="username" label="Username" type="string" required="true"/>
          <formField id="email" label="Email Address" type="string" required="true"/>
          <formField id="password" label="Password" type="string" required="true"/>
        </formData>
        <assignee>
          <dueDate>2025-12-31T23:59:59Z</dueDate>
        </assignee>
      </extensionElements>
    </userTask>
    <userTask id="userTask_ur_func_ext_2" name="Confirm Registration">
      <incoming>flow_ur_func_ext_6</incoming>
      <outgoing>flow_ur_func_ext_7</outgoing>
      <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <formData xmlns="http://example.org/form">
          <formField id="confirm" label="Confirm Details" type="boolean" required="true"/>
        </formData>
        <assignee>
          <dueDate>2026-01-15T23:59:59Z</dueDate>
        </assignee>
      </extensionElements>
    </userTask>
    <userTask id="userTask_ur_func_ext_3" name="Correct Email">
      <incoming>flow_ur_func_ext_8</incoming>
      <outgoing>flow_ur_func_ext_9</outgoing>
      <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <formData xmlns="http://example.org/form">
          <formField id="email" label="Email Address" type="string" required="true"/>
        </formData>
        <assignee>
          <dueDate>2025-12-31T23:59:59Z</dueDate>
        </assignee>
      </extensionElements>
    </userTask>
    <scriptTask id="scriptTask_ur_func_ext_1" name="Check Username Nonempty" scriptFormat="python">
      <incoming>flow_ur_func_ext_3</incoming>
      <outgoing>flow_ur_func_ext_4</outgoing>
      <script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
if username and len(username.strip()) > 0:
    username_valid = True
else:
    username_valid = False
]]></script>
    </scriptTask>
    <manualTask id="manualTask_ur_func_ext_1" name="Manual Review Registration">
      <incoming>flow_ur_func_ext_4</incoming>
      <outgoing>flow_ur_func_ext_5</outgoing>
      <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <assignee>
          <dueDate>2026-01-05T17:00:00Z</dueDate>
          <userEmail>supervisor@hub8.ai</userEmail>
        </assignee>
      </extensionElements>
    </manualTask>
    <exclusiveGateway id="exclusiveGateway_ur_func_ext_1" name="Email Format Valid?">
      <incoming>flow_ur_func_ext_5</incoming>
      <outgoing>flow_ur_func_ext_6</outgoing>
      <outgoing>flow_ur_func_ext_8</outgoing>
    </exclusiveGateway>
    <sequenceFlow id="flow_ur_func_ext_1" sourceRef="startEvent_ur_func_ext_1" targetRef="userTask_ur_func_ext_1" />
    <sequenceFlow id="flow_ur_func_ext_2" sourceRef="userTask_ur_func_ext_1" targetRef="serviceTask_ur_func_ext_1" />
    <sequenceFlow id="flow_ur_func_ext_3" sourceRef="serviceTask_ur_func_ext_1" targetRef="scriptTask_ur_func_ext_1" />
    <sequenceFlow id="flow_ur_func_ext_4" sourceRef="scriptTask_ur_func_ext_1" targetRef="manualTask_ur_func_ext_1" />
    <sequenceFlow id="flow_ur_func_ext_5" sourceRef="manualTask_ur_func_ext_1" targetRef="exclusiveGateway_ur_func_ext_1" />
    <sequenceFlow id="flow_ur_func_ext_6" name="Email OK" sourceRef="exclusiveGateway_ur_func_ext_1" targetRef="userTask_ur_func_ext_2">
      <conditionExpression xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">email_valid == True</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_ur_func_ext_7" sourceRef="userTask_ur_func_ext_2" targetRef="endEvent_ur_func_ext_success" />
    <sequenceFlow id="flow_ur_func_ext_8" name="Email Invalid" sourceRef="exclusiveGateway_ur_func_ext_1" targetRef="userTask_ur_func_ext_3">
      <conditionExpression xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">email_valid == False</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="flow_ur_func_ext_9" sourceRef="userTask_ur_func_ext_3" targetRef="endEvent_ur_func_ext_failed" />
  </process>
</definitions>`;

  const handleLoadSample = () => {
    setXmlContent(sampleXml);
  };

  const handleOpenEditor = () => {
    if (!xmlContent.trim()) {
      return;
    }
    setEditorOpen(true);
  };

  const handleSave = (updatedXml) => {
    setSavedXml(updatedXml);
    setXmlContent(updatedXml);
  };

  const handleClose = () => {
    setEditorOpen(false);
  };

  const downloadXml = () => {
    const blob = new Blob([savedXml || xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.bpmn';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            BPMN Element Editor
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Edit BPMN XML elements visually with form-based interface.
          </Typography>
        </Box>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            XML Input
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<FileText />}
              onClick={handleLoadSample}
            >
              Load Sample XML
            </Button>
            <Button
              variant="contained"
              startIcon={<Upload />}
              onClick={handleOpenEditor}
              disabled={!xmlContent.trim()}
            >
              Open Editor
            </Button>
            {savedXml && (
              <Button
                variant="outlined"
                startIcon={<Save />}
                onClick={downloadXml}
              >
                Download XML
              </Button>
            )}
          </Box>

          <TextField
            label="BPMN XML Content"
            value={xmlContent}
            onChange={(e) => setXmlContent(e.target.value)}
            multiline
            rows={10}
            fullWidth
            sx={{
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '12px',
              }
            }}
            placeholder="Paste your BPMN XML content here or load sample..."
          />

          {!xmlContent.trim() && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Please paste BPMN XML content or load the sample to begin editing.
            </Alert>
          )}
        </CardContent>
      </Card>

      {savedXml && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Updated XML Output
            </Typography>
            <TextField
              value={savedXml}
              multiline
              rows={8}
              fullWidth
              InputProps={{
                readOnly: true,
              }}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <BpmnElementEditor
        xmlContent={xmlContent}
        onSave={handleSave}
        onClose={handleClose}
        isOpen={editorOpen}
      />
    </Box>
  );
};

export default BpmnElementEditorPage;