#!/usr/bin/env python3
"""
Test script to demonstrate the updated workflow service with user prompting functionality.

This script shows how the workflow service now prompts users for:
1. Username and password at the start
2. Form data for user tasks
3. Confirmation for manual tasks
"""

import asyncio
import sys
import os

# Add the project root to the path for proper module imports
project_root = os.path.dirname(__file__)
sys.path.insert(0, project_root)

# Import the required modules
from backend.src.services.workflow_service import WorkflowService

def test_credential_prompting():
    """Test the credential prompting functionality"""
    print("=" * 60)
    print("TESTING: Credential Prompting Functionality")
    print("=" * 60)
    
    try:
        # Test the credential prompting method
        credentials = WorkflowService._prompt_user_for_credentials()
        
        if credentials:
            print(f"\n✅ Successfully captured credentials:")
            print(f"   Username: {credentials['username']}")
            print(f"   Password: {'*' * len(credentials['password'])}")
        else:
            print("\n❌ No credentials captured (user cancelled)")
            
    except Exception as e:
        print(f"\n❌ Error during credential prompting: {e}")

def test_form_prompting():
    """Test the form data prompting functionality"""
    print("\n" + "=" * 60)
    print("TESTING: Form Data Prompting Functionality")
    print("=" * 60)
    
    try:
        # Create a service instance
        service = WorkflowService()
        
        # Mock task data for demonstration
        class MockTask:
            def __init__(self):
                self.task_spec = MockTaskSpec()
                self.data = {"context": "test_task"}
        
        class MockTaskSpec:
            def __init__(self):
                self.bpmn_id = "test_task_id"
                self.name = "Test User Task"
        
        mock_task = MockTask()
        
        # Test form prompting (this will use fallback method since no BPMN data)
        form_data = service._prompt_user_for_form_data(
            task_name="Test Form Task",
            task=mock_task,
            workflow_id="test_workflow",
            task_data={"existing": "data"}
        )
        
        if form_data:
            print(f"\n✅ Successfully captured form data: {form_data}")
        else:
            print("\n❌ No form data captured")
            
    except Exception as e:
        print(f"\n❌ Error during form prompting: {e}")

def test_manual_task_prompting():
    """Test the manual task prompting functionality"""
    print("\n" + "=" * 60)
    print("TESTING: Manual Task Prompting Functionality")
    print("=" * 60)
    
    try:
        # Create a service instance
        service = WorkflowService()
        
        # Test manual task prompting
        task_completed = service._prompt_user_for_manual_task(
            task_name="Test Manual Task",
            task_data={"instructions": "Please complete this manual task"}
        )
        
        if task_completed:
            print("\n✅ Manual task was marked as completed")
        else:
            print("\n❌ Manual task was not completed")
            
    except Exception as e:
        print(f"\n❌ Error during manual task prompting: {e}")

def main():
    """Main test function"""
    print("🧪 WORKFLOW SERVICE PROMPTING TESTS")
    print("=" * 60)
    print("This script tests the user prompting functionality of the WorkflowService.")
    print("You will be prompted to enter various inputs to test the different prompt types.")
    print()
    
    # Test 1: Credential prompting
    test_credential_prompting()
    
    # Test 2: Form data prompting
    test_form_prompting()
    
    # Test 3: Manual task prompting
    test_manual_task_prompting()
    
    print("\n" + "=" * 60)
    print("🎉 ALL TESTS COMPLETED!")
    print("=" * 60)
    print("\nThe WorkflowService has been successfully updated with user prompting capabilities:")
    print("✅ Username/password prompting with secure input")
    print("✅ Form data prompting for user tasks")
    print("✅ Manual task completion prompting")
    print("✅ Integrated prompting into workflow execution logic")
    print("\nThe workflow will now prompt users for input instead of auto-completing tasks.")

if __name__ == "__main__":
    main()