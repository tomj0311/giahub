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
        Parse ALL extension elements, including custom namespaces
        """
        if node is None:
            node = self.node
            
        # Get SpiffWorkflow extensions first
        extensions = super().parse_extensions(node)
        
        # Now parse ALL other extension elements
        all_extensions = self._parse_all_extensions(node)
        
        # Merge them together
        extensions.update(all_extensions)
        
        return extensions
    
    def _parse_all_extensions(self, node):
        """
        Parse all extension elements regardless of namespace
        """
        extensions = {}
        
        # Find all extensionElements using DEFAULT_NSMAP
        xpath = xpath_eval(node, DEFAULT_NSMAP)
        ext_elements = xpath('./bpmn:extensionElements')
        
        if not ext_elements:
            return extensions
            
        ext_element = ext_elements[0]
        
        # Parse formData/formField elements
        form_data = self._parse_form_data(ext_element)
        if form_data:
            extensions['formData'] = form_data
            
        # Parse ioSpecification elements
        io_spec = self._parse_io_specification(ext_element)
        if io_spec:
            extensions['ioSpecification'] = io_spec
            
        # Parse any other custom elements
        custom_elements = self._parse_custom_elements(ext_element)
        extensions.update(custom_elements)
        
        return extensions
    
    def _parse_form_data(self, ext_element):
        """Parse formData and formField elements"""
        form_data = {}
        form_fields = []
        
        # Look for formData elements (any namespace)
        for form_data_elem in ext_element.xpath('.//*[local-name()="formData"]'):
            # Get formField children
            for field in form_data_elem.xpath('.//*[local-name()="formField"]'):
                field_data = {
                    'id': field.get('id'),
                    'label': field.get('label', field.get('id')),
                    'type': field.get('type', 'string'),
                    'required': field.get('required', 'false')
                }
                
                # Add any other attributes
                for attr, value in field.attrib.items():
                    if attr not in ['id', 'label', 'type', 'required']:
                        field_data[attr] = value
                        
                form_fields.append(field_data)
        
        # Look for direct formField elements
        if not form_fields:
            for field in ext_element.xpath('.//*[local-name()="formField"]'):
                field_data = {
                    'id': field.get('id'),
                    'label': field.get('label', field.get('id')),
                    'type': field.get('type', 'string'),
                    'required': field.get('required', 'false')
                }
                
                for attr, value in field.attrib.items():
                    if attr not in ['id', 'label', 'type', 'required']:
                        field_data[attr] = value
                        
                form_fields.append(field_data)
        
        if form_fields:
            form_data['formFields'] = form_fields
            
        return form_data
    
    def _parse_io_specification(self, ext_element):
        """Parse ioSpecification elements"""
        io_spec = {'inputs': {}, 'outputs': {}}
        
        # Look for ioSpecification elements
        for io_elem in ext_element.xpath('.//*[local-name()="ioSpecification"]'):
            # Parse inputs
            for inp in io_elem.xpath('.//*[local-name()="dataInput"]'):
                param_name = inp.get('name') or inp.get('id')
                if param_name:
                    io_spec['inputs'][param_name] = inp.get('value', '')
            
            # Parse outputs  
            for out in io_elem.xpath('.//*[local-name()="dataOutput"]'):
                param_name = out.get('name') or out.get('id')
                if param_name:
                    io_spec['outputs'][param_name] = out.get('name', param_name)
        
        return io_spec if io_spec['inputs'] or io_spec['outputs'] else {}
    
    def _parse_custom_elements(self, ext_element):
        """Parse any other custom extension elements"""
        custom = {}
        
        # Get all child elements that aren't already handled
        handled_elements = {'formData', 'formField', 'ioSpecification', 'properties', 'unitTests', 'serviceTaskOperator'}
        
        for child in ext_element:
            local_name = etree.QName(child).localname
            
            if local_name not in handled_elements:
                # Store the element as text content or attributes
                if child.text and child.text.strip():
                    custom[local_name] = child.text.strip()
                elif child.attrib:
                    custom[local_name] = dict(child.attrib)
                    
        return custom
    
    def create_task(self):
        """
        Create task with enhanced extensions
        """
        # Parse all extensions (including custom ones)
        extensions = self.parse_extensions()
        
        # Get SpiffWorkflow-specific attributes
        prescript = extensions.get('preScript')
        postscript = extensions.get('postScript')
        
        # Create the task
        task = self.spec_class(
            self.spec, 
            self.bpmn_id, 
            prescript=prescript, 
            postscript=postscript, 
            **self.bpmn_attributes
        )
        
        # Store ALL extensions on the task spec
        task.extensions = extensions
        
        return task