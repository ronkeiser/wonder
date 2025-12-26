<script lang="ts">
  import {
    SvelteFlow,
    Controls,
    Background,
    MiniMap,
    type Node,
    type Edge,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';

  const nodes: Node[] = $state([
    {
      id: '1',
      type: 'input',
      data: { label: 'Start' },
      position: { x: 250, y: 0 },
    },
    {
      id: '2',
      data: { label: 'Process Data' },
      position: { x: 100, y: 100 },
    },
    {
      id: '3',
      data: { label: 'Validate' },
      position: { x: 400, y: 100 },
    },
    {
      id: '4',
      data: { label: 'Transform' },
      position: { x: 250, y: 200 },
    },
    {
      id: '5',
      type: 'output',
      data: { label: 'End' },
      position: { x: 250, y: 300 },
    },
  ]);

  const edges: Edge[] = $state([
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e1-3', source: '1', target: '3', animated: true },
    { id: 'e2-4', source: '2', target: '4' },
    { id: 'e3-4', source: '3', target: '4' },
    { id: 'e4-5', source: '4', target: '5' },
  ]);
</script>

<svelte:head>
  <title>Workflows Playground</title>
</svelte:head>

<div class="h-full w-full">
  <SvelteFlow {nodes} {edges} fitView>
    <Controls />
    <Background />
    <MiniMap />
  </SvelteFlow>
</div>

<style>
  :global(.svelte-flow) {
    background-color: var(--color-surface);
  }
</style>
