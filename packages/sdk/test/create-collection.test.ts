import { describe, expect, it, vi } from 'vitest';
import { createCollection } from '../src/client-base';

describe('createCollection', () => {
  it('should create collection with create method', () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    expect(collection).toHaveProperty('create');
    expect(typeof collection.create).toBe('function');
  });

  it('should call POST with correct path for create', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.create({ name: 'Test' });

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workspaces', {
      body: { name: 'Test' },
    });
  });

  it('should return created resource data', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Test' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    const result = await collection.create({ name: 'Test' });

    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should have list method', () => {
    const mockClient = { GET: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    expect(collection).toHaveProperty('list');
  });

  it('should call GET for list', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.list();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {});
  });

  it('should pass query params to list', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.list({ limit: 10 });

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {
      params: { query: { limit: 10 } },
    });
  });

  it('should return list data', async () => {
    const mockData = [
      { id: '1', name: 'Workspace 1' },
      { id: '2', name: 'Workspace 2' },
    ];
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: mockData }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    const result = await collection.list();

    expect(result).toEqual(mockData);
  });

  it('should handle list with no query params', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    await collection.list();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {});
  });
});
