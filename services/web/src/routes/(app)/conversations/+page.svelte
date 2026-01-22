<script lang="ts">
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
  <title>Conversations</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <h1 class="text-xl font-semibold mb-6">Conversations</h1>

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
