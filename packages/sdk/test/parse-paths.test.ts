/**
 * Tests for parse-paths.ts
 */

import { describe, expect, it } from 'vitest';
import { NodeType, classifySegment, parsePathSegments } from '../scripts/parse-paths';

describe('Task 1.2: parsePathSegments', () => {
  it('parses simple path with /api/ prefix', () => {
    expect(parsePathSegments('/api/workspaces')).toEqual(['workspaces']);
  });

  it('parses path with parameter', () => {
    expect(parsePathSegments('/api/workspaces/{id}')).toEqual(['workspaces', '{id}']);
  });

  it('parses nested path', () => {
    expect(parsePathSegments('/api/projects/{project_id}/workflows')).toEqual([
      'projects',
      '{project_id}',
      'workflows',
    ]);
  });

  it('handles path without /api/ prefix', () => {
    expect(parsePathSegments('/workspaces')).toEqual(['workspaces']);
  });

  it('handles trailing slashes', () => {
    expect(parsePathSegments('/api/workspaces/')).toEqual(['workspaces']);
  });

  it('handles multiple slashes', () => {
    expect(parsePathSegments('//api//workspaces//')).toEqual(['workspaces']);
  });
});

describe('Task 1.3: classifySegment', () => {
  it('classifies collection segment', () => {
    expect(classifySegment('workspaces')).toBe(NodeType.Collection);
  });

  it('classifies parameter with curly braces', () => {
    expect(classifySegment('{id}')).toBe(NodeType.Param);
  });

  it('classifies parameter with colon', () => {
    expect(classifySegment(':workspace_id')).toBe(NodeType.Param);
  });

  it('classifies regular segment as collection (action detection happens in tree builder)', () => {
    // Actions can't be detected at this stage - need tree context
    expect(classifySegment('start')).toBe(NodeType.Collection);
  });
});
