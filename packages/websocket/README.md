# @wonder/ws

Base WebSocket streaming infrastructure for Cloudflare Durable Objects.

## Features

- WebSocket upgrade handling
- First-message authentication
- Hibernation-safe state management
- Connection lifecycle (close, error)
- Base class for service-specific streamers

## Usage

```typescript
import { BaseStreamer, type BaseMessage } from '@wonder/ws';

export class MyStreamer extends BaseStreamer {
  protected async validateAuth(token: string): Promise<boolean> {
    // Implement your auth logic
    return token === this.env.API_KEY;
  }

  protected handleMessage(ws: WebSocket, message: BaseMessage, state: any): void {
    // Handle authenticated messages
    if (message.type === 'subscribe') {
      // ...
    }
  }
}
```

## Authentication Flow

1. Client connects to WebSocket
2. Client sends `{ type: 'auth', token: '...' }` as first message
3. Server validates token via `validateAuth()`
4. On success, connection is marked authenticated
5. Subsequent messages handled via `handleMessage()`

All unauthenticated connections are closed with code 1008.
