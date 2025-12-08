import { describe, expect, it } from 'vitest';
import { buildPath } from '../src/client-base';

describe('buildPath', () => {
  it('should build simple path', () => {
    expect(buildPath(['workspaces'])).toBe('/api/workspaces');
  });

  it('should substitute path parameters', () => {
    expect(buildPath(['workspaces', ':id'], { id: '123' })).toBe('/api/workspaces/123');
  });

  it('should handle nested parameters', () => {
    expect(
      buildPath(['projects', ':project_id', 'workflows', ':id'], {
        project_id: 'p1',
        id: 'w1',
      }),
    ).toBe('/api/projects/p1/workflows/w1');
  });

  it('should throw on missing parameter', () => {
    expect(() => buildPath(['workspaces', ':id'], {})).toThrow('Missing parameter: id');
  });

  it('should handle multiple segments without parameters', () => {
    expect(buildPath(['workspaces', 'public', 'list'])).toBe('/api/workspaces/public/list');
  });

  it('should handle empty params object when no parameters needed', () => {
    expect(buildPath(['workspaces'], {})).toBe('/api/workspaces');
  });

  it('should handle parameter at start of path', () => {
    expect(buildPath([':id', 'details'], { id: 'abc' })).toBe('/api/abc/details');
  });

  it('should throw with descriptive error for missing parameter', () => {
    expect(() => buildPath(['workspaces', ':workspace_id', 'projects'], { id: '123' })).toThrow(
      'Missing parameter: workspace_id',
    );
  });
});
