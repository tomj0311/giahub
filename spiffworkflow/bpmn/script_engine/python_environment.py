# Copyright (C) 2023 Sartography
#
# This file is part of SpiffWorkflow.
#
# SpiffWorkflow is free software; you can redistribute it and/or
# modify it under the terms of the GNU Lesser General Public
# License as published by the Free Software Foundation; either
# version 3.0 of the License, or (at your option) any later version.
#
# SpiffWorkflow is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public
# License along with this library; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA
# 02110-1301  USA

import copy
import re
import textwrap
import types
import json


class BasePythonScriptEngineEnvironment:
    def __init__(self, environment_globals=None):
        self.globals = environment_globals or {}

    def evaluate(self, expression, context, external_context=None):
        raise NotImplementedError("Subclass must implement this method")

    def execute(self, script, context, external_context=None):
        raise NotImplementedError("Subclass must implement this method")

    def call_service(self, context, **kwargs):
        raise NotImplementedError("Subclass must implement this method.")


class TaskDataEnvironment(BasePythonScriptEngineEnvironment):

    def evaluate(self, expression, context, external_context=None):
        my_globals = copy.copy(self.globals)  # else we pollute all later evals.
        self._prepare_context(context)
        my_globals.update(external_context or {})
        my_globals.update(context)
        # Normalize whitespace to handle expressions with newlines and indentation
        expression = ' '.join(expression.split())
        return eval(expression, my_globals)

    def execute(self, script, context, external_context=None):
        self.check_for_overwrite(context, external_context or {})
        my_globals = copy.copy(self.globals)
        self._prepare_context(context)
        my_globals.update(external_context or {})
        context.update(my_globals)
        try:
            # Clean up markdown code blocks and backticks
            cleaned_script = self._clean_markdown_code(script)
            # Remove common leading whitespace to handle indented scripts
            cleaned_script = textwrap.dedent(cleaned_script).strip()
            exec(cleaned_script, context)
        finally:
            self._remove_globals_and_functions_from_context(context, external_context)
        return True

    def _clean_markdown_code(self, script):
        """Remove markdown code block markers and backticks from the script.
        
        This handles cases where the script contains:
        - ```python ... ``` blocks
        - ``` ... ``` blocks
        - Inline backticks
        """
        if not script:
            return script
            
        # Remove markdown code block markers - handle all variations
        # Remove ```python, ```javascript, etc. at start
        cleaned = re.sub(r'^```[a-zA-Z]*\s*', '', script.strip(), flags=re.MULTILINE)
        
        # Remove closing ``` at end
        cleaned = re.sub(r'\s*```\s*$', '', cleaned, flags=re.MULTILINE)
        
        # Remove any standalone ``` lines
        cleaned = re.sub(r'^\s*```\s*$', '', cleaned, flags=re.MULTILINE)
        
        # Remove lines that are just ```
        lines = cleaned.split('\n')
        lines = [line for line in lines if line.strip() != '```' and not line.strip().startswith('```')]
        
        return '\n'.join(lines).strip()

    def _prepare_context(self, context):
        pass

    def _remove_globals_and_functions_from_context(self, context, external_context=None):
        """When executing a script, don't leave the globals, functions,
        modules, and external methods in the context that we have modified.
        Convert non-serializable objects (like DataFrames) to JSON."""
        for k in list(context):
            obj = context[k]
            
            # Remove builtins, modules, functions, globals, and external context items
            if k == "__builtins__" or \
                    isinstance(obj, types.ModuleType) or \
                    hasattr(obj, '__call__') or \
                    k in self.globals or \
                    external_context and k in external_context:
                context.pop(k)
            else:
                # Convert non-serializable objects to JSON
                type_name = type(obj).__name__
                if type_name == 'DataFrame':
                    context[k] = json.loads(obj.to_json(orient='records'))
                elif type_name == 'Series':
                    context[k] = json.loads(obj.to_json(orient='records'))
                elif type_name == 'ndarray':
                    context[k] = obj.tolist()
                elif hasattr(type(obj), '__module__'):
                    module = type(obj).__module__
                    if module and module.startswith('pandas'):
                        if hasattr(obj, 'to_json'):
                            context[k] = json.loads(obj.to_json())
                        else:
                            context[k] = str(obj)
                    elif module and module.startswith('numpy'):
                        if hasattr(obj, 'tolist'):
                            context[k] = obj.tolist()
                        elif hasattr(obj, 'item'):
                            context[k] = obj.item()
                        else:
                            context[k] = str(obj)

    def check_for_overwrite(self, context, external_context):
        """It's possible that someone will define a variable with the
        same name as a pre-defined script, rendering the script un-callable.
        This results in a nearly indecipherable error.  Better to fail
        fast with a sensible error message."""
        func_overwrites = set(self.globals).intersection(context)
        func_overwrites.update(set(external_context).intersection(context))
        if len(func_overwrites) > 0:
            msg = f"You have task data that overwrites a predefined " \
                  f"function(s). Please change the following variable or " \
                  f"field name(s) to something else: {func_overwrites}"
            raise ValueError(msg)
