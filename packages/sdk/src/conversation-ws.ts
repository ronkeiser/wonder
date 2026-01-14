/**
 * WebSocket client for real-time conversation streaming
 *
 * Provides bidirectional communication with conversations:
 * - Send messages to start turns
 * - Receive all events (turn lifecycle, messages, tool dispatch, etc.)
 *
 * This is the ideal connection model for long-running conversations
 * with parallel turns and async operations.
 */

import type { components } from './generated/schema';

export type TraceEventEntry = components['schemas']['TraceEventEntry'];
export type EventEntry = components['schemas']['EventEntry'];

/**
 * Message sent from client to start a new turn
 */
export interface SendMessage {
  type: 'send';
  content: string;
  enableTraceEvents?: boolean;
}

/**
 * Event received from server
 */
export interface ServerEvent {
  type: 'event';
  stream: 'events' | 'trace';
  subscriptionId: string;
  event: TraceEventEntry | EventEntry;
}

/**
 * Error received from server
 */
export interface ServerError {
  type: 'error';
  message: string;
}

type ServerMessage = ServerEvent | ServerError;

/**
 * Options for creating a conversation connection
 */
export interface ConversationConnectionOptions {
  /** Enable trace events for all turns (default: true) */
  enableTraceEvents?: boolean;
  /** Callback for when connection opens */
  onOpen?: () => void;
  /** Callback for when connection closes */
  onClose?: (code: number, reason: string) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'closing' | 'closed';

/**
 * Real-time WebSocket connection to a conversation
 *
 * Provides a clean interface for interacting with conversations:
 * - send() to start new turns
 * - onEvent() to receive events
 * - waitForTurns() to wait until specific turns complete
 *
 * @example
 * ```typescript
 * const conn = await ConversationConnection.connect(baseUrl, apiKey, conversationId);
 *
 * conn.onTraceEvent((event) => {
 *   console.log(event.type, event.payload);
 * });
 *
 * // Start a turn
 * conn.send('Hello, how are you?');
 *
 * // Wait for all turns to complete
 * await conn.waitForAllTurnsCompleted();
 *
 * // Get collected events
 * const events = conn.getTraceEvents();
 *
 * conn.close();
 * ```
 */
export class ConversationConnection {
  private ws: WebSocket;
  private conversationId: string;
  private state: ConnectionState = 'connecting';

  // Event callbacks
  private traceEventCallbacks: Array<(event: TraceEventEntry) => void> = [];
  private eventCallbacks: Array<(event: EventEntry) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  // Collected events for later analysis
  private traceEvents: TraceEventEntry[] = [];
  private events: EventEntry[] = [];
  private turnIds: string[] = [];
  private activeTurnIds: Set<string> = new Set();

  // Promise resolvers for waitFor methods
  private turnCompleteResolvers: Map<string, () => void> = new Map();
  private allTurnsCompleteResolvers: Array<() => void> = [];

  private constructor(
    ws: WebSocket,
    conversationId: string,
    private options: ConversationConnectionOptions = {},
  ) {
    this.ws = ws;
    this.conversationId = conversationId;
  }

  /**
   * Create a new conversation connection
   */
  static async connect(
    baseUrl: string,
    apiKey: string | undefined,
    conversationId: string,
    options: ConversationConnectionOptions = {},
  ): Promise<ConversationConnection> {
    // Convert HTTP URL to WebSocket URL
    const wsUrl = baseUrl.replace(/^https?:\/\//, (match) =>
      match === 'https://' ? 'wss://' : 'ws://',
    );

    const enableTraceEvents = options.enableTraceEvents ?? true;
    const urlParams = new URLSearchParams({ enableTraceEvents: String(enableTraceEvents) });
    if (apiKey) {
      urlParams.set('apiKey', apiKey);
    }
    const url = `${wsUrl}/conversations/${conversationId}/ws?${urlParams.toString()}`;

    const ws = new WebSocket(url);

    const conn = new ConversationConnection(ws, conversationId, options);

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      ws.addEventListener('open', () => {
        clearTimeout(timeoutId);
        conn.state = 'connected';
        options.onOpen?.();
        resolve();
      });

      ws.addEventListener('error', () => {
        clearTimeout(timeoutId);
        reject(new Error('WebSocket connection failed'));
      });
    });

    // Set up message handling
    ws.addEventListener('message', (event) => {
      conn.handleMessage(event.data as string);
    });

    ws.addEventListener('close', (event) => {
      conn.state = 'closed';
      options.onClose?.(event.code, event.reason);
    });

    ws.addEventListener('error', () => {
      const error = new Error('WebSocket error');
      conn.errorCallbacks.forEach((cb) => cb(error));
      options.onError?.(error);
    });

    return conn;
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the conversation ID
   */
  getConversationId(): string {
    return this.conversationId;
  }

  /**
   * Send a message to start a new turn
   */
  send(content: string, options?: { enableTraceEvents?: boolean }): void {
    if (this.state !== 'connected') {
      throw new Error(`Cannot send message: connection is ${this.state}`);
    }

    const message: SendMessage = {
      type: 'send',
      content,
      enableTraceEvents: options?.enableTraceEvents ?? this.options.enableTraceEvents ?? true,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Register callback for trace events
   */
  onTraceEvent(callback: (event: TraceEventEntry) => void): void {
    this.traceEventCallbacks.push(callback);
  }

  /**
   * Register callback for regular events
   */
  onEvent(callback: (event: EventEntry) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Register callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Wait for a specific turn to complete
   */
  waitForTurn(turnId: string): Promise<void> {
    // Check if already completed
    if (!this.activeTurnIds.has(turnId)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.turnCompleteResolvers.set(turnId, resolve);
    });
  }

  /**
   * Wait for all currently active turns to complete
   */
  waitForAllTurnsCompleted(): Promise<void> {
    // Check if all turns already completed
    if (this.activeTurnIds.size === 0 && this.turnIds.length > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.allTurnsCompleteResolvers.push(resolve);
    });
  }

  /**
   * Wait for a specific number of turns to complete
   */
  async waitForTurnsCount(count: number): Promise<void> {
    while (this.getCompletedTurnIds().length < count) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Check if connection closed
      if (this.state === 'closed') {
        throw new Error('Connection closed while waiting for turns');
      }
    }
  }

  /**
   * Send a message and wait for the resulting turn to complete.
   *
   * This is useful for sequential multi-turn conversations where
   * each turn must complete before the next one starts.
   *
   * @returns The turn ID of the completed turn
   */
  async sendAndWait(
    content: string,
    options?: { enableTraceEvents?: boolean; timeout?: number },
  ): Promise<string> {
    const startTurnCount = this.turnIds.length;
    const timeout = options?.timeout ?? 30000;

    // Send the message
    this.send(content, options);

    // Wait for the new turn to be created
    const startTime = Date.now();
    while (this.turnIds.length <= startTurnCount) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for turn to be created');
      }
      if (this.state === 'closed') {
        throw new Error('Connection closed while waiting for turn creation');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Get the new turn ID
    const newTurnId = this.turnIds[startTurnCount];

    // Wait for the turn to complete
    while (this.activeTurnIds.has(newTurnId)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for turn ${newTurnId} to complete`);
      }
      if (this.state === 'closed') {
        throw new Error('Connection closed while waiting for turn completion');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return newTurnId;
  }

  /**
   * Get all collected trace events
   */
  getTraceEvents(): TraceEventEntry[] {
    return [...this.traceEvents];
  }

  /**
   * Get all collected regular events
   */
  getEvents(): EventEntry[] {
    return [...this.events];
  }

  /**
   * Get all turn IDs (in order of creation)
   */
  getTurnIds(): string[] {
    return [...this.turnIds];
  }

  /**
   * Get currently active turn IDs
   */
  getActiveTurnIds(): string[] {
    return [...this.activeTurnIds];
  }

  /**
   * Get completed turn IDs
   */
  getCompletedTurnIds(): string[] {
    return this.turnIds.filter((id) => !this.activeTurnIds.has(id));
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.state === 'connected') {
      this.state = 'closing';
      this.ws.close();
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      if (message.type === 'error') {
        const error = new Error(message.message);
        this.errorCallbacks.forEach((cb) => cb(error));
        this.options.onError?.(error);
        return;
      }

      if (message.type === 'event') {
        const event = message.event;

        if (message.stream === 'trace') {
          const traceEvent = event as TraceEventEntry;
          this.traceEvents.push(traceEvent);
          this.traceEventCallbacks.forEach((cb) => cb(traceEvent));

          // Track turn lifecycle
          this.handleTurnLifecycleEvent(traceEvent);
        } else {
          const regularEvent = event as EventEntry;
          this.events.push(regularEvent);
          this.eventCallbacks.forEach((cb) => cb(regularEvent));
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private handleTurnLifecycleEvent(event: TraceEventEntry): void {
    const payload = (typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload) as {
      turnId?: string;
    };
    const turnId = payload.turnId;

    if (!turnId) return;

    if (event.type === 'operation.turns.created') {
      if (!this.turnIds.includes(turnId)) {
        this.turnIds.push(turnId);
      }
      this.activeTurnIds.add(turnId);
    }

    if (event.type === 'operation.turns.completed' || event.type === 'operation.turns.failed') {
      this.activeTurnIds.delete(turnId);

      // Resolve turn-specific waiters
      const resolver = this.turnCompleteResolvers.get(turnId);
      if (resolver) {
        resolver();
        this.turnCompleteResolvers.delete(turnId);
      }

      // Check if all turns completed
      if (this.activeTurnIds.size === 0 && this.turnIds.length > 0) {
        this.allTurnsCompleteResolvers.forEach((resolve) => resolve());
        this.allTurnsCompleteResolvers = [];
      }
    }
  }
}
