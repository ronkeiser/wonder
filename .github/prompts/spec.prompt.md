---
name: spec
description: How we define the spec
agent: agent
tools:
  [
    'vscode',
    'execute',
    'read',
    'edit',
    'search',
    'web',
    'copilot-container-tools/*',
    'agent',
    'todo',
  ]
---

I want to make this very clear:

Both the docs and the implementation help to give us a picture of what the system must be. The docs are theoretically sound, but they lack complete implemenation details. The implementation is strong, but has gaps. Neither is the authority. WE are the authority. We are here to define the spec through end-to-end tests. We take the goals of the system, and we determine what the expected behavior should be.

The events and trace events give us extreme observability. We can also add more. We can add more tooling if necessary. Our goal is to determine with maximum resolution what the system should do, then implement as system that gives us 100% confidence that is behaves as expected.

Show me you understand.
