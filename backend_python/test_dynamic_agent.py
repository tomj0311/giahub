#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ai.agent import Agent
from backend_python.src.utils.agent_util import load_model_from_config

# Load model dynamically from config
model = load_model_from_config()

# Create agent with dynamic model
agent = Agent(
    model=model,
    show_tool_calls=True,
    markdown=True,
)

def generate(prompt):
    agent_ref = agent.run(message=prompt, stream=True)
    for chunk in agent_ref:
        yield chunk.content

if __name__ == "__main__":
    prompt = "What is the capital of paris?"
    for response in generate(prompt):
        print(response, end="", flush=True)
