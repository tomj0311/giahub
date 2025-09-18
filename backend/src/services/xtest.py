import os, sys

# Add the root directory to Python path so we can import spiffworkflow
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import json
from spiffworkflow import Workflow
from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
from spiffworkflow.bpmn import BpmnWorkflow
from spiffworkflow.util.task import TaskState

# Mock service function to simulate the service call
def call_service(input_json):
    """
    Simulates a web service call that processes inputJson and returns a result.
    In a real scenario, this could be an HTTP request or external API call.
    """
    data = json.loads(input_json)
    name = data.get("name", "Unknown")
    email = data.get("email", "Unknown")
    return f"Processed: Name={name}, Email={email}"

# Register the service function
service_functions = {
    "Call Service": call_service
}

def read_extensions(task_name):
    current_dir = os.path.dirname(__file__)
    bpmn_file_path = os.path.join(current_dir, "x2.bpmn")
    from lxml import etree
    with open(bpmn_file_path, 'r') as f:
        xml_content = f.read()
    root = etree.fromstring(xml_content.encode('utf-8'))
    nsmap = {'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL', 'spiffworkflow': 'http://spiffworkflow.org/bpmn/schema/1.0/core'}
    
    # Find task by ID or name
    task = root.xpath(f'//bpmn:serviceTask[@id="{task_name}" or @name="{task_name}"]', namespaces=nsmap)
    if task:
        ext_elements = task[0].xpath('./bpmn:extensionElements', namespaces=nsmap)
        if ext_elements:
            ext_xml = etree.tostring(ext_elements[0], pretty_print=True, encoding='unicode')
            return ext_xml
    return None

def extract_json_from_extensions(xml_text: str) -> str:
    if not xml_text:
        return ""

    import re

    # 1) Content inside <json> or <jsonData> tags (namespace-agnostic)
    tag_match = re.search(
        r"<(?:\w+:)?json(?:Data)?[^>]*>([\s\S]*?)</(?:\w+:)?json(?:Data)?>",
        xml_text,
        flags=re.IGNORECASE,
    )
    if tag_match and tag_match.group(1).strip():
        return tag_match.group(1).strip()

    # 2) First JSON object-like block
    json_like = re.search(r"\{[\s\S]*\}", xml_text)
    if json_like:
        return json_like.group(0).strip()

    # 3) Fallback: trimmed text (best-effort)
    return (xml_text or "").strip()
    
def format_json_string(json_text: str) -> str:
    try:
        obj = json.loads(json_text)
        return json.dumps(obj, indent=2)
    except Exception:
        return (json_text or "").strip()

def main():
    current_dir = os.path.dirname(__file__)
    bpmn_file_path = os.path.join(current_dir, "x3.bpmn")
    
    # Load BPMN XML file
    parser = BpmnParser()
    parser.add_bpmn_file(bpmn_file_path)

    # Get the workflow specification
    process_ids = parser.get_process_ids()
    if not process_ids:
        raise Exception("No executable processes found in BPMN")

    process_id = process_ids[0]

    top_level_spec = parser.get_spec(process_id)
    
    # Initialize workflow
    workflow = BpmnWorkflow(top_level_spec)

    # Execute workflow tasks
    while not workflow.is_completed():
        # Get ready tasks using the correct API
        ready_tasks = workflow.get_tasks(state=TaskState.READY)
        
        if not ready_tasks:
            print("No ready tasks found. Workflow may be stuck.")
            break
        
        for task in ready_tasks:
            task_name = task.task_spec.name
            task_type = type(task.task_spec).__name__
            print(f"Executing task: {task_name} (Type: {task_type})")
            
            # Handle start events (including BpmnStartTask and StartEvent)
            if task_type in ["BpmnStartTask", "StartEvent"]:
                print("Starting workflow...")
                task.complete()
                
            # Handle service tasks    
            elif task_type in ["BpmnServiceTask", "ServiceTask"]:
                extensions = read_extensions(task_name)
                json_only = extract_json_from_extensions(extensions)
                print(format_json_string(json_only))
                task.complete()
                
            # Handle script tasks
            elif task_type in ["BpmnScriptTask", "ScriptTask"]:
                # Execute the script task
                result = workflow.data.get("result", "No result")
                print(f"Script Task - Service output: {result}")
                task.complete()
                
            # Handle end events (including EndEvent and SimpleBpmnTask)
            elif task_type in ["BpmnEndTask", "EndEvent"]:
                print("Ending workflow...")
                task.complete()
                
            # Handle any other task types
            else:
                print(f"Completing task: {task_name} ({task_type})")
                task.complete()

    print("Workflow completed successfully!")

if __name__ == "__main__":
    main()