---
name: solutions
description: Implement proper solutions
agent: agent
tools:
  [
    'vscode',
    'edit',
    'execute',
    'read',
    'search',
    'web',
    'copilot-container-tools/*',
    'agent',
    'todo',
  ]
---

We are never here to implement quick fixes or get something working "for now". Everything we do should be an incremental step toward a complete, holistic, robust solution.

Type casting and type assertions should almost never be used. There are few exceptions, and they require explicit approval. If you find yourself using 'as', STOP.
