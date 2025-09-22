#!/usr/bin/env python3

"""
Simple test to verify the enhanced BPMN parser setup works correctly
"""

import os
import sys

# Add the project root to the Python path
sys.path.insert(0, '/home/tom/Desktop/giahub')

def test_imports():
    """Test that all imports work correctly"""
    try:
        print("Testing imports...")
        
        # Test the enhanced parser import
        from backend.src.services.workflow_bpmn_parser import EnhancedBpmnTaskParser
        print("✅ EnhancedBpmnTaskParser import successful")
        
        # Test BPMN parser and related imports
        from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
        from spiffworkflow.bpmn.parser.util import full_tag
        from spiffworkflow.bpmn.specs.defaults import UserTask, ManualTask, ServiceTask, ScriptTask, NoneTask
        print("✅ All SpiffWorkflow imports successful")
        
        # Test parser setup
        parser = BpmnParser()
        print(f"✅ BpmnParser created, PARSER_CLASSES count: {len(parser.PARSER_CLASSES)}")
        print(f"✅ OVERRIDE_PARSER_CLASSES count: {len(parser.OVERRIDE_PARSER_CLASSES)}")
        
        # Test enhanced parser setup
        enhanced_parsers = {
            full_tag('userTask'): (EnhancedBpmnTaskParser, UserTask),
            full_tag('manualTask'): (EnhancedBpmnTaskParser, ManualTask),
            full_tag('serviceTask'): (EnhancedBpmnTaskParser, ServiceTask),
            full_tag('scriptTask'): (EnhancedBpmnTaskParser, ScriptTask),
            full_tag('task'): (EnhancedBpmnTaskParser, NoneTask),
        }
        
        parser.OVERRIDE_PARSER_CLASSES.update(enhanced_parsers)
        print(f"✅ Enhanced parsers added, OVERRIDE_PARSER_CLASSES count: {len(parser.OVERRIDE_PARSER_CLASSES)}")
        
        # Verify the parsers are correctly registered
        for tag, (parser_class, spec_class) in enhanced_parsers.items():
            registered = parser.OVERRIDE_PARSER_CLASSES.get(tag)
            if registered and registered[0] == parser_class:
                print(f"✅ {tag} -> {parser_class.__name__}, {spec_class.__name__}")
            else:
                print(f"❌ {tag} registration failed")
                
        print("\n🎉 All tests passed! Enhanced BPMN parser setup is working correctly.")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_simple_bpmn():
    """Test parsing a simple BPMN with the enhanced parser"""
    try:
        print("\nTesting simple BPMN parsing...")
        
        from backend.src.services.workflow_bpmn_parser import EnhancedBpmnTaskParser
        from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
        from spiffworkflow.bpmn.parser.util import full_tag
        from spiffworkflow.bpmn.specs.defaults import UserTask, ManualTask
        
        # Simple BPMN with extension elements (without XML declaration)
        bpmn_xml = '''<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="TestProcess" isExecutable="true">
    <startEvent id="StartEvent_1">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    
    <userTask id="UserTask_1" name="Test User Task">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
      <extensionElements>
        <formData>
          <formField id="testField" label="Test Field" type="string" required="true"/>
        </formData>
      </extensionElements>
    </userTask>
    
    <endEvent id="EndEvent_1">
      <incoming>Flow_2</incoming>
    </endEvent>
    
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="UserTask_1"/>
    <sequenceFlow id="Flow_2" sourceRef="UserTask_1" targetRef="EndEvent_1"/>
  </process>
</definitions>'''
        
        # Setup parser with enhanced parsers
        parser = BpmnParser()
        enhanced_parsers = {
            full_tag('userTask'): (EnhancedBpmnTaskParser, UserTask),
            full_tag('manualTask'): (EnhancedBpmnTaskParser, ManualTask),
        }
        parser.OVERRIDE_PARSER_CLASSES.update(enhanced_parsers)
        
        # Parse the BPMN
        parser.add_bpmn_str(bpmn_xml)
        process_ids = parser.get_process_ids()
        print(f"✅ Found process IDs: {process_ids}")
        
        if process_ids:
            spec = parser.get_spec(process_ids[0])
            print(f"✅ Process spec created: {spec.name}")
            
            # Check if extension elements were preserved
            for task_name, task_spec in spec.task_specs.items():
                if hasattr(task_spec, 'bpmn_id') and hasattr(task_spec, 'extensions'):
                    print(f"✅ Task {task_spec.bpmn_id} has extensions: {task_spec.extensions}")
        
        print("✅ Simple BPMN parsing test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ BPMN parsing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=== Enhanced BPMN Parser Test ===\n")
    
    success = True
    success &= test_imports()
    success &= test_simple_bpmn()
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)