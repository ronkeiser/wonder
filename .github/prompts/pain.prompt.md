---
name: coordinator
description: Understand the coordinator service
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

I have written a series of e2e tests that live in packages/tests. They test workflows by scaffolding a project, using the sdk to create a workflow def, and running them against the live services. After we implemented coordinator, simple workflow examples worked right away, but as we increased the complexity of the workflows, agents really struggled to debug them. I implemented a very thorough trace events system which I thought would make it very obvious where issues are occurring, but actually agents seemed to get lost in the weeds and endlessly explore rabbit-holes trying to debug fan-out/synchronization issues.

Here's what I want to do:

I want to write a series of e2e test that take advantage of the mock action. These will be extremely comprehensive tests that start from the most simple and basic of workflows and assert what every piece of information at every step will be. We will painstakingly track the actions of coordinator and workers to verify that every single function is doing exactly what we expect and what we need to support very complex workflows. With each new test, we'll increase the complexity of the workflow slightly, and work our way up incrementall until we know we can support highly complex workflows with hundreds of nodes. Our goal is maximum condfidence in the ability of the system to support dream scenarios.

First, show me you understand what I want to do. Does it actually make sense to you?
