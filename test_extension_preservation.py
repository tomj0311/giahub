"""
Test script to verify extension elements are preserved in workflow serialization
"""

import asyncio
import json
from backend.src.services.workflow_service_persistent import WorkflowServicePersistent


async def test_extension_preservation():
    """Test that extension elements are preserved during workflow serialization"""
    
    # Sample BPMN with extension elements
    bpmn_xml = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="TestProcess" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    
    <userTask id="UserTask_1" name="User Input">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
      <extensionElements>
        <formData>
          <formField id="firstName" label="First Name" type="string" required="true"/>
          <formField id="lastName" label="Last Name" type="string" required="true"/>
          <formField id="email" label="Email Address" type="email" required="false"/>
        </formData>
      </extensionElements>
    </userTask>
    
    <serviceTask id="ServiceTask_1" name="Process Data">
      <incoming>Flow_2</incoming>
      <outgoing>Flow_3</outgoing>
      <extensionElements>
        <ioSpecification>
          <dataInput id="userData" name="userData"/>
          <dataOutput id="processedData" name="processedData"/>
        </ioSpecification>
      </extensionElements>
    </serviceTask>
    
    <endEvent id="EndEvent_1" name="End">
      <incoming>Flow_3</incoming>
    </endEvent>
    
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="UserTask_1"/>
    <sequenceFlow id="Flow_2" sourceRef="UserTask_1" targetRef="ServiceTask_1"/>
    <sequenceFlow id="Flow_3" sourceRef="ServiceTask_1" targetRef="EndEvent_1"/>
  </process>
</definitions>"""

    print("Testing extension element preservation...")
    
    # Test the enhanced parser
    from backend.src.services.workflow_bpmn_parser import EnhancedBpmnTaskParser
    from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
    from spiffworkflow.bpmn import BpmnWorkflow
    from spiffworkflow.bpmn.script_engine import PythonScriptEngine
    
    try:
        # Create parser with enhanced task parser
        parser = BpmnParser()
        parser.TASK_PARSERS = {
            **parser.TASK_PARSERS,
            'userTask': EnhancedBpmnTaskParser,
            'serviceTask': EnhancedBpmnTaskParser,
        }
        
        parser.add_bpmn_str(bpmn_xml)
        process_ids = parser.get_process_ids()
        spec = parser.get_spec(process_ids[0])
        
        script_engine = PythonScriptEngine()
        workflow = BpmnWorkflow(spec, script_engine=script_engine)
        
        # Check if extension elements are preserved
        print("\\nChecking task specs for preserved extensions:")
        
        for task_name, task_spec in spec.task_specs.items():
            if hasattr(task_spec, 'bpmn_id') and hasattr(task_spec, 'extensions'):
                print(f"\\nTask: {task_spec.bpmn_id}")
                print(f"Extensions: {json.dumps(task_spec.extensions, indent=2)}")
        
        # Test serialization
        from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
        serializer = BpmnWorkflowSerializer()
        
        # Serialize the workflow
        serialized_json = serializer.serialize_json(workflow)
        serialized_data = json.loads(serialized_json)
        
        print("\\nChecking serialized data for extension preservation:")
        
        # Check if extensions are in the serialized data
        if 'spec' in serialized_data and 'task_specs' in serialized_data['spec']:
            for task_name, task_data in serialized_data['spec']['task_specs'].items():
                if 'extensions' in task_data:
                    print(f"\\nSerialized Task: {task_name}")
                    print(f"Serialized Extensions: {json.dumps(task_data['extensions'], indent=2)}")
        
        # Test deserialization
        restored_workflow = serializer.deserialize_json(serialized_json)
        
        print("\\nChecking restored workflow for extension preservation:")
        for task_name, task_spec in restored_workflow.spec.task_specs.items():
            if hasattr(task_spec, 'bpmn_id') and hasattr(task_spec, 'extensions'):
                print(f"\\nRestored Task: {task_spec.bpmn_id}")
                print(f"Restored Extensions: {json.dumps(task_spec.extensions, indent=2)}")
        
        print("\\n✅ Extension preservation test completed!")
        
    except Exception as e:
        print(f"\\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_extension_preservation())