<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let messages = $state(data.messages);
  let inputValue = $state('');
  let sending = $state(false);
  let messagesContainer: HTMLDivElement;

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

  async function sendMessage() {
    const content = inputValue.trim();
    if (!content || sending) return;

    sending = true;
    inputValue = '';

    try {
      const res = await fetch(`/api/conversations/${data.conversation.id}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        await refreshMessages();
      }
    } finally {
      sending = false;
    }
  }

  async function refreshMessages() {
    const res = await fetch(`/api/conversations/${data.conversation.id}/messages`);
    if (res.ok) {
      const data = await res.json();
      messages = data.messages;
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<svelte:head>
  <title>Conversation {data.conversation.id}</title>
</svelte:head>

<div class="flex flex-col h-full">
  <div class="flex items-center gap-3 p-4 border-b border-border">
    <h1 class="text-lg font-semibold">Conversation</h1>
    <span class="text-xs px-2 py-0.5 rounded {getStatusClasses(data.conversation.status)}">
      {data.conversation.status}
    </span>
    <span class="text-xs text-foreground-muted font-mono ml-auto">{data.conversation.id}</span>
  </div>

  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if messages.length === 0}
      <p class="text-foreground-muted text-sm text-center py-8">No messages yet. Start the conversation below.</p>
    {:else}
      {#each messages as message}
        <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[80%] px-4 py-2 rounded-lg {message.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-surface-raised border border-border'}"
          >
            <p class="text-sm whitespace-pre-wrap">{message.content}</p>
            <p
              class="text-xs mt-1 {message.role === 'user' ? 'text-blue-200' : 'text-foreground-muted'}"
            >
              {new Date(message.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="p-4 border-t border-border">
    <div class="flex gap-2">
      <textarea
        bind:value={inputValue}
        onkeydown={handleKeydown}
        placeholder="Type a message..."
        rows="1"
        class="flex-1 px-3 py-2 rounded border border-border bg-surface-raised text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={sending}
      ></textarea>
      <button
        onclick={sendMessage}
        disabled={sending || !inputValue.trim()}
        class="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  </div>
</div>
