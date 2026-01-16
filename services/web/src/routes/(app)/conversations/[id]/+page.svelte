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
  <title>Conversation {data.conversation.id}</title>
</svelte:head>

<div class="p-6">
  <div class="flex items-center gap-3 mb-6">
    <h1 class="text-xl font-semibold">Conversation</h1>
    <span class="text-xs px-2 py-0.5 rounded {getStatusClasses(data.conversation.status)}">
      {data.conversation.status}
    </span>
  </div>

  <dl class="grid gap-4 text-sm">
    <div>
      <dt class="text-foreground-subtle text-xs">ID</dt>
      <dd class="font-mono">{data.conversation.id}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Status</dt>
      <dd>{data.conversation.status}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Participants</dt>
      <dd>
        <ul class="mt-1 space-y-1">
          {#each data.conversation.participants as participant}
            <li class="font-mono text-xs">
              {#if participant.type === 'user'}
                User: {participant.userId}
              {:else}
                Agent: {participant.agentId}
              {/if}
            </li>
          {/each}
        </ul>
      </dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Created</dt>
      <dd>{new Date(data.conversation.createdAt).toLocaleString()}</dd>
    </div>
    <div>
      <dt class="text-foreground-subtle text-xs">Updated</dt>
      <dd>{new Date(data.conversation.updatedAt).toLocaleString()}</dd>
    </div>
  </dl>
</div>
