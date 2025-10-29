# BPMN Workflow Processes

This folder contains executable BPMN workflow definitions that orchestrate AI agents, Python scripts, and business logic.

## 🎯 System Architecture

```
BPMN Workflow Engine
  ├── Visual BPMN Designer (XML)
  ├── Inline Python Scripts (executed in sequence)
  ├── AI Agent Orchestration (call by name)
  └── Automatic Context Accumulation (variables flow between tasks)
```

## 🚀 Key Features

### 1. **Visual Workflow Design**
- Standard BPMN 2.0 XML format
- Visual diagrams with flow control
- Start/End events, Tasks, Gateways, Flows

### 2. **Inline Python Execution**
- Embed Python code directly in `<scriptTask>` elements
- Full access to imports (os, json, pymongo, datetime, etc.)
- Variables automatically accumulate across tasks

### 3. **AI Agent Integration**
- Call agents via `<serviceTask>` with `agent_executor` module
- Pass variables by name (automatic resolution)
- Agents: Research, Mongo Query, Code Generator, etc.

### 4. **Context Flow**
- Variables created in Task N are available in Task N+1
- No manual passing required - automatic context propagation
- Shared state across entire workflow execution

### 5. **Multi-Tenant Support**
- Automatic tenant isolation in database operations
- User context available in all tasks
- Secure data access patterns

## 📋 Task Types

### **UserTask** - Human Input
```xml
<userTask id="UserTask_001" name="Input Question">
  <extensionElements>
    <formData>
      <formField id="prompt" label="Question" type="string" required="true"/>
    </formData>
  </extensionElements>
</userTask>
```
**Output:** Variables defined in formFields (e.g., `prompt`)

---

### **ScriptTask** - Python Execution
```xml
<scriptTask id="ScriptTask_001" name="Process Data">
  <script><![CDATA[
```python
import json
# Access previous task variables
user_input = prompt  # from UserTask

# Process data
result = process_function(user_input)

# Create output variables (automatically available to next task)
output_data = json.dumps(result)
```
  ]]></script>
</scriptTask>
```
**Output:** Any variables created in the script

---

### **ServiceTask** - AI Agent Call
```xml
<serviceTask id="ServiceTask_001" name="Call AI Agent">
  <extensionElements>
    <serviceConfiguration>
      <function>
        <moduleName>agent_executor</moduleName>
        <functionName>run_agent</functionName>
        <parameters>
          <parameter name="agent_name" value="Research"/>
          <parameter name="prompt" value="variable_name"/>
          <parameter name="user" value="user"/>
          <parameter name="conv_id" value="conv_id"/>
        </parameters>
      </function>
    </serviceConfiguration>
  </extensionElements>
</serviceTask>
```
**Output:** `response` (agent's response)

---

## 🔧 Variable Resolution

### Automatic Variable Lookup
```xml
<!-- Reference variable by name - backend resolves automatically -->
<parameter name="prompt" value="intelligent_query_prompt"/>
```

### Context Variables Always Available
- Any variable from previous tasks

### Variable Naming Best Practices
- Use descriptive names: `intelligent_query_prompt`, `sample_data_json`
- Prefix with type: `projects_json`, `user_email`, `query_result`
- Add step numbers in logs: `[BPMN-Step1]`, `[BPMN-Step2]`

---

## 📊 Common Patterns

### Pattern 1: User Input → AI Processing → Database Query
```
UserTask (get question)
  → ScriptTask (prepare context)
  → ServiceTask (call AI agent)
  → ScriptTask (execute query)
  → End (return results)
```

### Pattern 2: Fetch Data → AI Analysis → Report
```
ScriptTask (fetch from DB)
  → ScriptTask (format data)
  → ServiceTask (AI analysis)
  → ScriptTask (generate report)
  → End (return report)
```

### Pattern 3: Multi-Agent Workflow
```
UserTask (input)
  → ServiceTask (Agent 1: Intent Detection)
  → ServiceTask (Agent 2: Query Generation)
  → ServiceTask (Agent 3: Result Formatting)
  → End (final output)
```

---

## 🛠️ Development Guidelines

### 1. Script Task Best Practices

**✅ DO:**
```python
# Import at the top
import os
import json
from datetime import datetime

# Use functions for clarity
def process_data(input_data):
    # Logic here
    return result

# Create output variables clearly
output_variable = process_data(input_from_previous_task)
print(f"[BPMN-Step1] Processed {len(output_variable)} items")
```

**❌ DON'T:**
```python
# Inline everything without structure
result=json.loads(input)["data"][0]["value"]
# No logging
# No error handling
```

### 2. Error Handling

**Always wrap in try-catch:**
```python
try:
    # Your logic
    result = risky_operation()
except Exception as e:
    print(f"[ERROR] Task failed: {e}")
    result = []  # Fallback value
```

### 3. Logging Standards

**Use consistent prefixes:**
```python
print(f"[BPMN-Step1] Fetched {count} records")
print(f"[BPMN-Step2] Built prompt: {len(prompt)} chars")
print(f"[ERROR] Failed to parse: {error_msg}")
print(f"[DEBUG] Variable value: {var}")
```

### 4. MongoDB Operations

**Always use tenant isolation:**
```python
from pymongo import MongoClient

client = MongoClient(os.getenv('MONGO_URL'))
db = client[os.getenv('MONGO_DB')]

# Always filter by tenantId
tenant_id = user.get('tenantId')
results = db['collection'].find({'tenantId': tenant_id})
```

### 5. Data Serialization

**Convert MongoDB types:**
```python
from bson import ObjectId
from datetime import datetime, date

def serialize(doc):
    if isinstance(doc, ObjectId):
        return str(doc)
    elif isinstance(doc, (datetime, date)):
        return doc.isoformat()
    elif isinstance(doc, dict):
        return {k: serialize(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize(item) for item in doc]
    return doc
```

---

## 🎨 Example Workflows

### Example 1: Intelligent Query System
**File:** `intelligent_query.bpmn`

**Flow:**
1. **UserTask**: Get natural language question
2. **ScriptTask**: Fetch database schema samples
3. **ScriptTask**: Build intelligent prompt with examples
4. **ServiceTask**: Call Research agent to generate query
5. **ScriptTask**: Execute query and format results

**Output:** Query results + metadata

---

### Example 2: Document Analysis
**File:** `document_analysis.bpmn`

**Flow:**
1. **UserTask**: Upload document
2. **ScriptTask**: Extract text and metadata
3. **ServiceTask**: AI summarization
4. **ServiceTask**: AI key points extraction
5. **ScriptTask**: Generate final report

**Output:** Formatted analysis report

---

### Example 3: Multi-Collection Report
**File:** `multi_collection_report.bpmn`

**Flow:**
1. **ScriptTask**: Fetch data from Collection A
2. **ScriptTask**: Fetch data from Collection B
3. **ScriptTask**: Fetch data from Collection C
4. **ServiceTask**: AI-powered data synthesis
5. **ScriptTask**: Generate comprehensive report

**Output:** Cross-collection insights

---

## 🔍 Debugging Workflows

### Check Execution Logs
```bash
# Look for BPMN step logs
grep "BPMN-Step" logs/workflow.log

# Check for errors
grep "ERROR" logs/workflow.log

# See variable flow
grep "Variable" logs/workflow.log
```

### Add Debug Points
```python
# In any ScriptTask
print(f"[DEBUG] Current variables:")
print(f"  - prompt: {prompt[:100]}...")
print(f"  - user: {user}")
print(f"  - Available vars: {dir()}")
```

### Test Individual Tasks
```python
# Copy script from BPMN and test standalone
# Mock the input variables
prompt = "test question"
user = {"id": "123", "tenantId": "tenant1"}

# Run your script logic
# Verify outputs
```

---

## 📚 Available AI Agents

| Agent Name | Purpose | LLM | Best For |
|------------|---------|-----|----------|
| Research | General Q&A, code generation | GPT-4o | Complex reasoning tasks |
| Mongo Query | MongoDB query generation | GPT-4o | Database operations |
| Code Generator | Python/JS code creation | GPT-4o | Automation scripts |
| Data Analyst | Data analysis & insights | GPT-4o | Reporting & analytics |
| Document Parser | Text extraction & processing | GPT-3.5-turbo | Document handling |

### How to Add New Agent
1. Configure in `/api/agents` endpoint
2. Set model, tools, knowledge base
3. Reference by name in ServiceTask

---

## 🚦 Workflow Lifecycle

```
1. Design BPMN → Visual or XML editor
2. Save to /processes folder
3. Upload via /api/workflow/upload
4. Execute via /api/workflow/execute
5. Monitor via logs
6. Get results from _output_* variables
```

---

## 📦 File Organization

```
processes/
├── README.md                      # This file
├── intelligent_query.bpmn         # Smart DB query workflow
├── document_analysis.bpmn         # Document processing
├── multi_agent_research.bpmn      # Multi-agent collaboration
├── data_pipeline.bpmn             # ETL workflows
└── templates/
    ├── basic_template.bpmn        # Starter template
    ├── agent_template.bpmn        # AI agent workflow
    └── database_template.bpmn     # DB operation workflow
```

---

## 💡 Tips & Tricks

### 1. Reuse Code with Functions
```python
# Define once, use in multiple tasks
def fetch_from_mongo(collection, query, tenant_id):
    client = MongoClient(os.getenv('MONGO_URL'))
    db = client[os.getenv('MONGO_DB')]
    query['tenantId'] = tenant_id
    return list(db[collection].find(query))
```

### 2. Chain Agents for Complex Tasks
```
Intent Detection Agent 
  → Query Generation Agent 
  → Result Formatting Agent
```

### 3. Use Intermediate Variables
```python
# Instead of nested operations
user_email = user.get('email')
user_tenant = user.get('tenantId')
query_filter = {'assignee': user_email, 'tenantId': user_tenant}
```

### 4. Version Your Workflows
```
intelligent_query_v1.bpmn
intelligent_query_v2.bpmn
intelligent_query_v3_optimized.bpmn
```

---

## 🎓 Learning Resources

### BPMN Basics
- BPMN 2.0 Specification: https://www.omg.org/spec/BPMN/2.0/
- Visual BPMN Designer: Use bpmn.io modeler

### Python Integration
- pymongo docs: https://pymongo.readthedocs.io/
- datetime handling: https://docs.python.org/3/library/datetime.html

### AI Agent Best Practices
- Clear, specific prompts
- Provide examples in context
- Use structured output (JSON)
- Handle errors gracefully

---

## 🔒 Security Considerations

1. **Always filter by tenantId** in database queries
2. **Validate user permissions** before data access
3. **Sanitize user input** in ScriptTasks
4. **Use environment variables** for secrets
5. **Log security events** for audit trails

---

## 📈 Performance Optimization

1. **Limit MongoDB results** - Use `.limit()` in queries
2. **Minimize agent calls** - Combine prompts when possible
3. **Cache frequent queries** - Store in variables
4. **Use indexes** - Ensure DB has proper indexes
5. **Parallel execution** - Use parallel gateways for independent tasks

---

## 🤝 Contributing

When creating new workflows:

1. **Document purpose** - Add comments in BPMN
2. **Test thoroughly** - Validate all paths
3. **Add examples** - Include sample inputs/outputs
4. **Log extensively** - Use `[BPMN-StepN]` format
5. **Handle errors** - Never leave tasks unguarded

---

## 📞 Support

For workflow development help:
- Check logs in `/logs` folder
- Review existing workflows in this folder
- Test individual tasks before integration
- Use debug prints liberally during development

---

**Last Updated:** October 28, 2025
**Version:** 1.0
**Maintainer:** Development Team
