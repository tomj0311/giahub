// Test file to verify XML case preservation
const { captureNestedElements } = require('./utils/bpmnParser.js');

// Create a test XML element
const parser = new DOMParser();
const testXML = `
<serviceTask id="test" name="Test">
  <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
    <serviceConfiguration xmlns="http://example.org/service">
      <agent>
        <agentName>ai_agent_001</agentName>
        <inputParameter name="prompt" value=""/>
      </agent>
    </serviceConfiguration>
  </extensionElements>
</serviceTask>
`;

const xmlDoc = parser.parseFromString(testXML, 'text/xml');
const serviceTask = xmlDoc.querySelector('serviceTask');

console.log('Original XML:');
console.log(testXML);

console.log('\nCaptured nested elements:');
const captured = captureNestedElements(serviceTask);
console.log(captured);

console.log('\nShould preserve case: extensionElements, serviceConfiguration, agentName, inputParameter');