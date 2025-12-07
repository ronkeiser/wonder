import { describe, expect, it } from 'vitest';
import { CustomTypeRegistry } from '../src/custom-types.js';

describe('CustomTypeRegistry', () => {
  it('should register a custom type', () => {
    const registry = new CustomTypeRegistry();
    const definition = {
      validate: (value: unknown) => typeof value === 'string',
      description: 'Test type',
    };

    registry.register('test_type', definition);

    expect(registry.has('test_type')).toBe(true);
    expect(registry.get('test_type')).toBe(definition);
  });

  it('should throw when registering duplicate type', () => {
    const registry = new CustomTypeRegistry();
    const definition = {
      validate: (value: unknown) => typeof value === 'string',
    };

    registry.register('test_type', definition);

    expect(() => {
      registry.register('test_type', definition);
    }).toThrow("Custom type 'test_type' is already registered");
  });

  it('should return undefined for unregistered type', () => {
    const registry = new CustomTypeRegistry();

    expect(registry.has('unknown')).toBe(false);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should return all registered types', () => {
    const registry = new CustomTypeRegistry();

    registry.register('type1', {
      validate: (value: unknown) => typeof value === 'string',
    });

    registry.register('type2', {
      validate: (value: unknown) => typeof value === 'number',
    });

    const all = registry.getAll();

    expect(all.size).toBe(2);
    expect(all.has('type1')).toBe(true);
    expect(all.has('type2')).toBe(true);
  });

  it('should return immutable copy of types', () => {
    const registry = new CustomTypeRegistry();

    registry.register('type1', {
      validate: (value: unknown) => typeof value === 'string',
    });

    const all = registry.getAll();
    all.set('type2', { validate: () => true });

    // Original registry should not be affected
    expect(registry.has('type2')).toBe(false);
  });
});
