import sys
import json
import os

# Add the root directory to Python path so we can import spiffworkflow
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from spiffworkflow.bpmn import BpmnWorkflow
from spiffworkflow.bpmn.parser.BpmnParser import BpmnParser
from spiffworkflow.bpmn.serializer import BpmnWorkflowSerializer
from spiffworkflow.bpmn.script_engine import PythonScriptEngine
from spiffworkflow.util.task import TaskState

BASE_DIR = os.path.dirname(__file__)
DEFAULT_BPMN_PATH = os.path.join(BASE_DIR, 'x1.bpmn')

def handle_user_task(task):
    """
    Handle UserTask by prompting for form fields and setting task data.
    """
    print(f"\nTask: {task.task_spec.name}")
    dct = {}
    # Prefer structured form fields when present (Camunda formData, etc.)
    form = getattr(task.task_spec, 'form', None)
    if form and getattr(form, 'fields', None):
        for field in form.fields:
            label = getattr(field, 'label', field.id)
            prompt = f"{label}: "
            response = input(prompt)
            dct[field.id] = response
    else:
        # Fallback for models without parsed form metadata
        print("No form metadata found; prompting for basic fields.")
        # Common fields for this sample process
        for fid, label in [("firstName", "First Name"), ("lastName", "Last Name")]:
            response = input(f"{label}: ")
            dct[fid] = response
    task.data.update(dct)

def handle_manual_task(task):
    """
    Handle ManualTask by prompting user to confirm completion.
    """
    print(f"\nTask: {task.task_spec.name}")
    confirm = input("Do you confirm this task is completed? (y/n): ")
    if confirm.lower() == 'y':
        pass  # Proceed
    else:
        print("Task not confirmed. Aborting.")
        sys.exit(1)

def run_workflow_from_bpmn_file(bpmn_path: str = DEFAULT_BPMN_PATH):
    if not os.path.isabs(bpmn_path):
        bpmn_path = os.path.abspath(bpmn_path)
    if not os.path.exists(bpmn_path):
        raise FileNotFoundError(f"BPMN file not found: {bpmn_path}")

    # Use default Python script engine (builtins are available to exec)
    script_engine = PythonScriptEngine()

    # Load the BPMN XML from file
    parser = BpmnParser()
    with open(bpmn_path, 'r', encoding='utf-8') as f:
        bpmn_xml = f.read()
    clean_bpmn = bpmn_xml.replace('<?xml version="1.0" encoding="UTF-8"?>', '').strip()
    parser.add_bpmn_str(clean_bpmn)
    
    # Get the first process ID and create workflow spec
    process_ids = parser.get_process_ids()
    if not process_ids:
        raise Exception("No executable processes found in BPMN")
    
    process_id = process_ids[0]
    spec = parser.get_spec(process_id)
    subprocess_specs = parser.get_subprocess_specs(process_id, specs={})

    # Create BPMN workflow engine
    workflow = BpmnWorkflow(spec, subprocess_specs=subprocess_specs, script_engine=script_engine)

    # Kick the engine to run all non-manual tasks initially (start/script/gateways)
    workflow.do_engine_steps()

    # Main loop: handle ready tasks until workflow is completed
    while workflow.is_completed() is False:
        ready_tasks = [t for t in workflow.get_tasks() if t.state == TaskState.READY]

        if not ready_tasks:
            print("No ready tasks. Checking if waiting...")
            # Try to progress any auto tasks
            workflow.do_engine_steps()
            continue

        for task in ready_tasks:
            if task.task_spec.__class__.__name__ == 'UserTask':
                handle_user_task(task)
                task.complete()
            elif task.task_spec.__class__.__name__ == 'ManualTask':
                handle_manual_task(task)
                task.complete()
            else:
                # For other tasks (script, gateways), let the engine handle them
                pass

        # After handling human tasks, progress the engine
        workflow.do_engine_steps()

    print("\nWorkflow completed successfully!")


def main():
    # Optional: accept a BPMN file path as the first CLI argument
    bpmn_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BPMN_PATH
    run_workflow_from_bpmn_file(bpmn_path)

if __name__ == "__main__":
    main()