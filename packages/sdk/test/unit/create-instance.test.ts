import { describe, expect, it, vi } from 'vitest';
import { createInstance } from '../../src/client-base';

describe('createInstance', () => {
  it('should inject ID into path for get', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: { id: '123' } }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.get();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should return resource data from get', async () => {
    const mockData = { id: '123', name: 'Test Workspace' };
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: mockData }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    const result = await instance.get();

    expect(result).toEqual(mockData);
  });

  it('should inject ID for update', async () => {
    const mockClient = {
      PUT: vi.fn().mockResolvedValue({ data: { id: '123' } }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.update({ name: 'Updated' });

    expect(mockClient.PUT).toHaveBeenCalledWith('/api/workspaces/123', {
      body: { name: 'Updated' },
    });
  });

  it('should return updated resource data', async () => {
    const mockData = { id: '123', name: 'Updated' };
    const mockClient = {
      PUT: vi.fn().mockResolvedValue({ data: mockData }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    const result = await instance.update({ name: 'Updated' });

    expect(result).toEqual(mockData);
  });

  it('should inject ID for delete', async () => {
    const mockClient = {
      DELETE: vi.fn().mockResolvedValue({ data: null }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    await instance.delete();

    expect(mockClient.DELETE).toHaveBeenCalledWith('/api/workspaces/123', {});
  });

  it('should not return value from delete', async () => {
    const mockClient = {
      DELETE: vi.fn().mockResolvedValue({ data: null }),
    };

    const instance = createInstance(mockClient, '/api/workspaces/:id', '123');
    const result = await instance.delete();

    expect(result).toBeUndefined();
  });

  it('should support nested resource paths', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: {} }),
    };

    const instance = createInstance(mockClient, '/api/projects/:project_id/workflows/:id', 'w123');

    // Note: parent ID should already be in path
    await instance.get();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/projects/:project_id/workflows/w123', {});
  });

  it('should handle multiple :id replacements correctly', async () => {
    const mockClient = {
      GET: vi.fn().mockResolvedValue({ data: {} }),
    };

    // Only the :id parameter should be replaced, not :project_id
    const instance = createInstance(mockClient, '/api/projects/:project_id/workflows/:id', 'w456');
    await instance.get();

    expect(mockClient.GET).toHaveBeenCalledWith('/api/projects/:project_id/workflows/w456', {});
  });
});
