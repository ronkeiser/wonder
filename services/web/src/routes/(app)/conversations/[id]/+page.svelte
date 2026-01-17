<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface Message {
    id: string;
    conversationId: string;
    turnId: string;
    role: 'user' | 'agent';
    content: string;
    createdAt: string;
  }

  let messages = $state<Message[]>(data.messages);
  let inputValue = $state('');
  let connected = $state(false);
  let streamingContent = $state('');
  let currentTurnId = $state<string | null>(null);
  let messagesContainer: HTMLDivElement;
  let ws: WebSocket | null = null;

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

  function connectWebSocket() {
    // Connect directly to the API server's chat endpoint (Conversation DO)
    const wsUrl = `wss://api.wflow.app/conversations/${data.conversation.id}/chat`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected = true;
    };

    ws.onclose = () => {
      connected = false;
      // Reconnect after a delay
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      connected = false;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
      } catch {
        // Ignore parse errors
      }
    };
  }

  function handleWebSocketMessage(msg: {
    type: string;
    turnId?: string;
    token?: string;
    conversationId?: string;
    message?: string;
    code?: string;
  }) {
    // Handle Conversation DO protocol
    switch (msg.type) {
      case 'connected':
        // Connection established
        break;

      case 'turn_started':
        currentTurnId = msg.turnId ?? null;
        streamingContent = '';
        scrollToBottom();
        break;

      case 'token':
        // Streaming token
        if (msg.token) {
          streamingContent += msg.token;
          scrollToBottom();
        }
        break;

      case 'turn_complete':
        // Turn complete - finalize any streaming content as a message
        if (streamingContent) {
          const newMessage: Message = {
            id: `msg-${Date.now()}`,
            conversationId: data.conversation.id,
            turnId: msg.turnId ?? '',
            role: 'agent',
            content: streamingContent,
            createdAt: new Date().toISOString(),
          };
          messages = [...messages, newMessage];
          streamingContent = '';
          scrollToBottom();
        }
        currentTurnId = null;
        break;

      case 'error':
        currentTurnId = null;
        streamingContent = '';
        console.error('Conversation error:', msg.message, msg.code);
        break;
    }
  }

  function sendMessage() {
    const content = inputValue.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;

    inputValue = '';

    // Add user message immediately
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: data.conversation.id,
      turnId: '',
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    messages = [...messages, userMessage];
    scrollToBottom();

    // Send via WebSocket (Conversation DO protocol)
    ws.send(JSON.stringify({ type: 'message', content }));
  }

  async function refreshMessages() {
    const res = await fetch(`/api/conversations/${data.conversation.id}/messages`);
    if (res.ok) {
      const result = await res.json();
      messages = result.messages;
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

  onMount(() => {
    connectWebSocket();
    scrollToBottom();
  });

  onDestroy(() => {
    if (ws) {
      ws.close();
    }
  });
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
    <span
      class="text-xs px-2 py-0.5 rounded {connected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}"
    >
      {connected ? 'Connected' : 'Disconnected'}
    </span>
    <span class="text-xs text-foreground-muted font-mono ml-auto">{data.conversation.id}</span>
  </div>

  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#if messages.length === 0 && !streamingContent}
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

      {#if currentTurnId && !streamingContent}
        <div class="flex justify-start">
          <div class="max-w-[80%] px-4 py-2 rounded-lg bg-surface-raised border border-border">
            <div class="flex items-center gap-2 text-sm text-foreground-muted">
              <span class="flex gap-1">
                <span class="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-2 h-2 bg-foreground-muted rounded-full animate-bounce" style="animation-delay: 300ms"></span>
              </span>
            </div>
          </div>
        </div>
      {:else if streamingContent}
        <div class="flex justify-start">
          <div class="max-w-[80%] px-4 py-2 rounded-lg bg-surface-raised border border-border">
            <p class="text-sm whitespace-pre-wrap">{streamingContent}<span class="animate-pulse">▊</span></p>
          </div>
        </div>
      {/if}
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
        disabled={!connected}
      ></textarea>
      <button
        onclick={sendMessage}
        disabled={!inputValue.trim() || !connected}
        class="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  </div>
</div>
