import { describe, expect, it } from 'vitest';
import type {
  ActionMethod,
  ClientConfig,
  CollectionMethods,
  InstanceMethods,
} from '../src/client-base';

describe('client-base types', () => {
  it('should define CollectionMethods interface', () => {
    const methods: CollectionMethods = {
      create: expect.any(Function) as any,
      list: expect.any(Function) as any,
    };
    expect(methods).toBeDefined();
    expect(methods.create).toBeDefined();
    expect(methods.list).toBeDefined();
  });

  it('should define InstanceMethods interface', () => {
    const methods: InstanceMethods = {
      get: expect.any(Function) as any,
      update: expect.any(Function) as any,
      delete: expect.any(Function) as any,
    };
    expect(methods).toBeDefined();
    expect(methods.get).toBeDefined();
    expect(methods.update).toBeDefined();
    expect(methods.delete).toBeDefined();
  });

  it('should define ActionMethod type', () => {
    const action: ActionMethod = async (body?: any) => {
      return { status: 'ok' };
    };
    expect(typeof action).toBe('function');
  });

  it('should define ClientConfig interface', () => {
    const config: ClientConfig = {
      baseUrl: 'https://api.example.com',
      headers: { 'X-Custom': 'value' },
    };
    expect(config).toBeDefined();
    expect(config.baseUrl).toBe('https://api.example.com');
    expect(config.headers).toEqual({ 'X-Custom': 'value' });
  });

  it('should allow optional ClientConfig fields', () => {
    const config: ClientConfig = {};
    expect(config).toBeDefined();
  });
});
