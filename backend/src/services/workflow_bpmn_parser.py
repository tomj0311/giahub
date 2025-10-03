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
        """
        result = {}
        
        # Get all attributes - flatten them directly into result instead of @attributes
        if element.attrib:
            result.update(dict(element.attrib))
        
        # Get text content (including CDATA)
        if element.text and element.text.strip():
            result['@text'] = element.text.strip()
        
        # Parse all child elements
        children = {}
        for child in element:
            child_name = etree.QName(child).localname
            child_data = self._parse_element_recursively(child)
            
            # If we already have this child name, make it a list
            if child_name in children:
                if not isinstance(children[child_name], list):
                    children[child_name] = [children[child_name]]
                children[child_name].append(child_data)
            else:
                children[child_name] = child_data
        
        # Add children to result
        if children:
            result.update(children)
        
        # If element has no children and only text, just return the text
        if len(result) == 1 and '@text' in result:
            return result['@text']
        
        # If element has no children and no attributes, just return the text
        if not children and not element.attrib and element.text:
            return element.text.strip()
        
        # If element is completely empty, return empty dict
        if not result:
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