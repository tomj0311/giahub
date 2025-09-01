# AI Models - Simplified Interface

This folder provides simplified wrapper classes for all AI model implementations, making them easier to import and use. Similar to the `functions` folder structure, each model provider has its own file with clean, simple imports.

## Available Models

### OpenAI
```python
from ai.models import OpenAI, OpenAILike
# or
from ai.models.openai import OpenAI, OpenAILike
```

### Anthropic (Claude)
```python
from ai.models import Anthropic
# or  
from ai.models.anthropic import Anthropic
```

### Google (Gemini)
```python
from ai.models import Google, GoogleOpenAI
# or
from ai.models.google import Google, GoogleOpenAI
```

### Azure OpenAI
```python
from ai.models import Azure
# or
from ai.models.azure import Azure
```

### Ollama
```python
from ai.models import Ollama, Hermes, OllamaTools
# or
from ai.models.ollama import Ollama, Hermes, OllamaTools
```

### Together AI
```python
from ai.models import Together
# or
from ai.models.together import Together
```

### Vertex AI
```python
from ai.models import VertexAI
# or
from ai.models.vertexai import VertexAI
```

### xAI
```python
from ai.models import XAI
# or
from ai.models.xai import XAI
```

### Dummy (for testing)
```python
from ai.models import Dummy
# or
from ai.models.dummy import Dummy
```

## Usage Example

Instead of the more verbose import:
```python
from ai.model.openai.chat import OpenAIChat
from ai.model.anthropic.claude import Claude
```

You can now use the simplified imports:
```python
from ai.models import OpenAI, Anthropic

# Use exactly as before - these are direct wrappers
model1 = OpenAI(id="gpt-4")
model2 = Anthropic(id="claude-3-sonnet")
```

## Backward Compatibility

All original class names are available as aliases:
- `OpenAIChat` → `OpenAI`
- `Claude` → `Anthropic`  
- `Gemini` → `Google`
- `GeminiOpenAIChat` → `GoogleOpenAI`
- etc.

This ensures existing code continues to work while providing cleaner imports for new code.
