<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function getStatusClasses(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-500';
      case 'active':
        return 'bg-blue-500/10 text-blue-500';
      case 'waiting':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'failed':
        return 'bg-red-500/10 text-red-500';
      default:
        return '';
    }
  }
</script>

<svelte:head>
  <title>Agent {data.agent.id}</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Agent</h1>

  <dl class="grid gap-4 text-sm">
    <div>
      <dt class="text-foreground-subtle text-xs">ID</dt>
      <dd class="font-mono">{data.agent.id}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Projects</dt>
      <dd>
        <ul class="mt-1 space-y-1">
          {#each data.agent.projectIds as projectId}
            <li>
              <a href="/projects/{projectId}" class="font-mono text-xs text-link hover:underline">
                {projectId}
              </a>
            </li>
          {/each}
        </ul>
      </dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Persona</dt>
      <dd class="font-mono">{data.agent.personaId ?? 'None'}</dd>
    </div>
    {#if data.agent.personaVersion}
      <div>
        <dt class="text-foreground-subtle text-xs">Persona Version</dt>
        <dd>{data.agent.personaVersion}</dd>
      </div>
    {/if}
    <div>
      <dt class="text-foreground-subtle text-xs">Created</dt>
      <dd>{new Date(data.agent.createdAt).toLocaleString()}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Updated</dt>
      <dd>{new Date(data.agent.updatedAt).toLocaleString()}</dd>
    </div>
  </dl>

  <div class="flex items-center justify-between mt-8 mb-4">
    <h2 class="text-lg font-semibold">Conversations</h2>
    <form method="POST" action="?/startConversation" use:enhance>
      <button
        type="submit"
        class="px-3 py-1.5 text-sm bg-accent text-white border-none rounded cursor-pointer hover:bg-accent/90 transition-colors"
      >
        New Conversation
      </button>
    </form>
  </div>

  {#if data.conversations.length === 0}
    <p class="text-foreground-muted text-sm">No conversations yet.</p>
  {:else}
    <div class="grid gap-4">
      {#each data.conversations as conversation}
        <div class="p-4 border border-border rounded bg-surface-raised">
          <div class="flex items-center justify-between">
            <a href="/conversations/{conversation.id}" class="text-sm font-medium text-link hover:underline">
              {conversation.id}
            </a>
            <span class="text-xs px-2 py-0.5 rounded {getStatusClasses(conversation.status)}">
              {conversation.status}
            </span>
          </div>
          <p class="text-xs text-foreground-muted mt-1">
            {conversation.participants.length} participant{conversation.participants.length !== 1 ? 's' : ''}
          </p>
          <p class="text-xs text-foreground-muted mt-1">
            Created {new Date(conversation.createdAt).toLocaleString()}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
