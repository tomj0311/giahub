#!/usr/bin/env python3
"""
Test script to verify the form field parsing works correctly
"""

import json
from lxml import etree

# Test XML with the user's structure
test_xml = '''<userTask id="Task_1" name="Enter First and Last Name">
    <incoming>Flow_1</incoming>
    <outgoing>Flow_2</outgoing>
    <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <formData>
            <formField id="firstName" label="First Name" type="string" required="true"/>
            <formField id="lastName" label="Last Name" type="string" required="true"/>
        </formData>
    </extensionElements>
</userTask>'''

# Alternative XML with bpmn: namespace
test_xml_with_namespace = '''<bpmn:userTask id="Task_1" name="Enter First and Last Name" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
    <bpmn:incoming>Flow_1</bpmn:incoming>
    <bpmn:outgoing>Flow_2</bpmn:outgoing>
    <bpmn:extensionElements>
        <bpmn:formData>
            <bpmn:formField id="firstName" label="First Name" type="string" required="true"/>
            <bpmn:formField id="lastName" label="Last Name" type="string" required="true"/>
        </bpmn:formData>
    </bpmn:extensionElements>
</bpmn:userTask>'''

def parse_form_data(xml_content, bpmn_id):
    """
    Simulates the read_extensions method logic
    """
    try:
        root = etree.fromstring(xml_content.encode('utf-8'))
        bpmn_map = {"root": root}
        
        nsmap = {
            'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL', 
            'spiffworkflow': 'http://spiffworkflow.org/bpmn/schema/1.0/core',
            'custom': 'http://example.com/bpmn/extensions'
        }
        
        print(f"Searching for BPMN element with ID: {bpmn_id}")
        
        # Search all loaded BPMN documents for any element with the given ID
        for _, root in bpmn_map.items():
            # Search for any BPMN element with the given ID (using wildcard *)
            element = root.xpath(f'//*[@id="{bpmn_id}"]', namespaces=nsmap)
            
            if element:
                print(f"Found BPMN element: {element[0].tag} with ID: {bpmn_id}")
                ext_elements = element[0].xpath('.//bpmn:extensionElements', namespaces=nsmap)
                
                if not ext_elements:
                    # Try without namespace
                    ext_elements = element[0].xpath('.//*[local-name()="extensionElements"]')
                
                if ext_elements:
                    print(f"Found extension elements")
                    form_data = {}
                    form_fields = []
                    
                    # Search for formData elements regardless of namespace (bpmn:formData, custom:formData, formData, etc.)
                    form_data_elements = ext_elements[0].xpath('.//*[local-name()="formData"]')
                    
                    if form_data_elements:
                        print(f"Found {len(form_data_elements)} formData elements")
                        # Extract form fields from formData elements
                        for form_data_elem in form_data_elements:
                            # Search for formField elements regardless of namespace
                            fields = form_data_elem.xpath('.//*[local-name()="formField"]')
                            print(f"Found {len(fields)} formField elements in formData")
                            
                            for field in fields:
                                field_id = field.get('id')
                                field_label = field.get('label', field_id)
                                field_type = field.get('type', 'string')
                                field_required = field.get('required', 'false')
                                
                                if field_id:
                                    field_data = {
                                        'id': field_id,
                                        'label': field_label,
                                        'type': field_type,
                                        'required': field_required
                                    }
                                    
                                    # Add any other attributes
                                    for attr, value in field.attrib.items():
                                        if attr not in ['id', 'label', 'type', 'required']:
                                            field_data[attr] = value
                                    
                                    form_fields.append(field_data)
                                    print(f"Added formField: {field_data}")
                    
                    # If we found form fields, structure them properly
                    if form_fields:
                        form_data = {
                            'formData': {},
                            'formField': form_fields
                        }
                    
                    print(f"Extracted form data: {form_data}")
                    return json.dumps(form_data, indent=2) if form_data else "{}"
                else:
                    print(f"No extension elements found for element with ID: {bpmn_id}")
        
        print(f"No BPMN element found with ID: {bpmn_id}")
        return "{}"
        
    except Exception as e:
        print(f"Error parsing: {e}")
        return "{}"

if __name__ == "__main__":
    print("Testing XML without namespace prefix:")
    print("="*50)
    result1 = parse_form_data(test_xml, "Task_1")
    print("Result:")
    print(result1)
    print()
    
    print("Testing XML with bpmn: namespace prefix:")
    print("="*50)
    result2 = parse_form_data(test_xml_with_namespace, "Task_1")
    print("Result:")
    print(result2)
    print()
    
    # Parse results to verify structure
    if result1 != "{}":
        data1 = json.loads(result1)
        print(f"Number of form fields found (no namespace): {len(data1.get('formField', []))}")
        for field in data1.get('formField', []):
            print(f"  - {field['id']}: {field['label']} ({field['type']}, required: {field['required']})")
    
    if result2 != "{}":
        data2 = json.loads(result2)
        print(f"Number of form fields found (with namespace): {len(data2.get('formField', []))}")
        for field in data2.get('formField', []):
            print(f"  - {field['id']}: {field['label']} ({field['type']}, required: {field['required']})")