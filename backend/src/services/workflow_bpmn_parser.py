"""
Enhanced BPMN Task Parser that preserves all extension elements
"""

import json
from lxml import etree
from spiffworkflow.spiff.parser.task_spec import SpiffTaskParser, SPIFFWORKFLOW_NSMAP
from spiffworkflow.bpmn.parser.util import xpath_eval, DEFAULT_NSMAP


class EnhancedBpmnTaskParser(SpiffTaskParser):
    """
    Extended BPMN task parser that preserves ALL extension elements,
    not just SpiffWorkflow-specific ones.
    """
    
    def parse_extensions(self, node=None):
        """
        Parse ALL child elements of the task recursively - completely generic
        """
        if node is None:
            node = self.node
            
        # Get SpiffWorkflow extensions first
        extensions = super().parse_extensions(node)
        
        # Parse ALL child elements of the task recursively
        all_elements = self._parse_all_child_elements(node)
        
        # Merge them together
        extensions.update(all_elements)
        
        return extensions
    
    def _parse_all_child_elements(self, node):
        """
        Parse ALL child elements of the task node recursively
        """
        elements = {}
        
        # Parse every child element of the task
        for child in node:
            element_data = self._parse_element_recursively(child)
            local_name = etree.QName(child).localname
            
            # Skip basic BPMN flow elements that SpiffWorkflow handles
            if local_name in ['incoming', 'outgoing']:
                continue
                
            # If we already have this element name, make it a list
            if local_name in elements:
                if not isinstance(elements[local_name], list):
                    elements[local_name] = [elements[local_name]]
                elements[local_name].append(element_data)
            else:
                elements[local_name] = element_data
        
        return elements
    
    def _parse_element_recursively(self, element):
        """
        Recursively parse any XML element into a Python structure
        FIXED TO HANDLE THE ACTUAL XML STRUCTURE WITH FUNCTION/PARAMETERS
        """
        # Get element name
        element_name = etree.QName(element).localname
        
        # Start with attributes as base
        result = {}
        if element.attrib:
            result.update(dict(element.attrib))
        
        # Get direct text content (not from children)
        direct_text = element.text.strip() if element.text else ""
        
        # Parse all child elements
        child_elements = {}
        for child in element:
            child_name = etree.QName(child).localname
            child_result = self._parse_element_recursively(child)
            
            # Handle multiple children with same name
            if child_name in child_elements:
                if not isinstance(child_elements[child_name], list):
                    child_elements[child_name] = [child_elements[child_name]]
                child_elements[child_name].append(child_result)
            else:
                child_elements[child_name] = child_result
        
        # Determine what to return based on content
        if child_elements and result:
            # Has both children and attributes
            result.update(child_elements)
            if direct_text:
                result['_text'] = direct_text
            return result
        elif child_elements:
            # Has only children - return children structure
            if direct_text:
                child_elements['_text'] = direct_text
            return child_elements
        elif result:
            # Has only attributes
            if direct_text:
                result['_text'] = direct_text
            return result
        elif direct_text:
            # Has only text
            return direct_text
        else:
            # Empty element
            return {}
            
        return result
    
    def create_task(self):
        """
        Create task with enhanced extensions - handles different task types
        """
        # Parse all extensions (including custom ones)
        extensions = self.parse_extensions()
        
        # Get SpiffWorkflow-specific attributes
        prescript = extensions.get('preScript')
        postscript = extensions.get('postScript')
        
        # Handle different task types that require special parameters
        task_args = {
            'prescript': prescript, 
            'postscript': postscript
        }
        task_args.update(self.bpmn_attributes)
        
        # Handle ScriptTask - requires 'script' parameter
        if self.spec_class.__name__ == 'ScriptTask':
            script = self.get_script()
            task = self.spec_class(
                self.spec, 
                self.bpmn_id, 
                script=script,
                **task_args
            )
        else:
            # Standard task creation for other task types
            task = self.spec_class(
                self.spec, 
                self.bpmn_id, 
                **task_args
            )
        
        # Store ALL extensions on the task spec
        task.extensions = extensions
        
        return task
    
    def get_script(self):
        """
        Gets the script content from the BPMN script element.
        Used for ScriptTask creation.
        """
        try:
            # Use xpath to find script element
            script_elements = self.xpath('.//bpmn:script')
            if script_elements:
                script_text = script_elements[0].text
                return script_text if script_text else ""
            else:
                # No script element found - return empty string
                return ""
        except Exception as e:
            # If there's any error, return empty string rather than failing
            return ""