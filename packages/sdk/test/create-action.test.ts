import { describe, expect, it, vi } from 'vitest';
import { createAction } from '../src/client-base';

describe('createAction', () => {
  it('should create action that calls correct method', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { status: 'started' } }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/start', 'POST');
    await action({ force: true });

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/start', {
      body: { force: true },
    });
  });

  it('should return response data', async () => {
    const mockData = { status: 'started', id: 'w123' };
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: mockData }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/start', 'POST');
    const result = await action({ force: true });

    expect(result).toEqual(mockData);
  });

  it('should support GET actions', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { status: 'healthy' } }),
    };

    const action = createAction(mockClient, '/api/health', 'GET');
    await action();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/health', {});
  });

  it('should handle actions without body', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: {} }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/cancel', 'POST');
    await action();

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/cancel', {});
  });

  it('should work with PUT method', async () => {
    const mockClient = {
      PUT: vi.fn().mockResolvedValue({ data: { updated: true } }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/pause', 'PUT');
    await action({ duration: 60 });

    expect(mockClient.PUT).toHaveBeenCalledWith('/api/workflows/:id/pause', {
      body: { duration: 60 },
    });
  });

  it('should work with DELETE method', async () => {
    const mockClient = {
      DELETE: vi.fn().mockResolvedValue({ data: null }),
    };

    const action = createAction(mockClient, '/api/cache/clear', 'DELETE');
    await action();

    expect(mockClient.DELETE).toHaveBeenCalledWith('/api/cache/clear', {});
  });

  it('should pass body only when provided', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: {} }),
    };

    const action = createAction(mockClient, '/api/workflows/:id/restart', 'POST');

    // Call without body
    await action();
    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/restart', {});

    // Call with body
    await action({ clean: true });
    expect(mockClient.POST).toHaveBeenCalledWith('/api/workflows/:id/restart', {
      body: { clean: true },
    });
  });
});
