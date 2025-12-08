import { describe, expect, it, vi } from 'vitest';
import { createCollection } from '../../src/client-base';

describe('collection with instance access', () => {
  it('should allow calling collection as function', () => {
    const mockClient = { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    expect(typeof collection).toBe('function');
  });

  it('should return instance methods when called with ID', () => {
    const mockClient = { GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), POST: vi.fn() };
    const collection = createCollection(mockClient, '/api/workspaces');

    const instance = collection('123');

    expect(instance).toHaveProperty('get');
    expect(instance).toHaveProperty('update');
    expect(instance).toHaveProperty('delete');
  });

  it('should have both collection and instance methods', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
      POST: vi.fn().mockResolvedValue({ data: { id: '1' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    // Collection methods
    await collection.list();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces', {});

    // Instance methods
    const instance = collection('123');
    await instance.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should preserve collection.create method', async () => {
    const mockClient = {
      POST: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Test' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    expect(typeof collection.create).toBe('function');
    const result = await collection.create({ name: 'Test' });

    expect(mockClient.POST).toHaveBeenCalledWith('/api/workspaces', {
      body: { name: 'Test' },
    });
    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('should preserve collection.list method', async () => {
    const mockData = [
      { id: '1', name: 'Workspace 1' },
      { id: '2', name: 'Workspace 2' },
    ];
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: mockData }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    expect(typeof collection.list).toBe('function');
    const result = await collection.list();

    expect(result).toEqual(mockData);
  });

  it('should support calling with different IDs', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { id: '123' } }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');

    const instance1 = collection('123');
    await instance1.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});

    const instance2 = collection('456');
    await instance2.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/456', {});
  });

  it('should allow instance methods to be called', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { id: '123', name: 'Test' } }),
      PUT: vi.fn().mockResolvedValue({ data: { id: '123', name: 'Updated' } }),
      DELETE: vi.fn().mockResolvedValue({ data: null }),
    };

    const collection = createCollection(mockClient, '/api/workspaces');
    const instance = collection('123');

    // Get
    await instance.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});

    // Update
    await instance.update({ name: 'Updated' });
    expect(mockClient.PUT).toHaveBeenCalledWith('/api/workspaces/123', {
      body: { name: 'Updated' },
    });

    // Delete
    await instance.delete();
    expect(mockClient.DELETE).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should work with nested resource paths', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: [] }),
      POST: vi.fn().mockResolvedValue({ data: { id: 'w1' } }),
    };

    const collection = createCollection(mockClient, '/api/projects/p1/workflows');

    // Collection methods work
    await collection.list();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/projects/p1/workflows', {});

    // Instance access works
    const instance = collection('w1');
    await instance.get();
    expect(mockClient.GET).toHaveBeenCalledWith('/api/projects/p1/workflows/w1', {});
  });
});
