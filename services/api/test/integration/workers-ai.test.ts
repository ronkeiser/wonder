import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runInference, type ChatMessage } from '../../src/infrastructure/clients/workers-ai';

describe('Workers AI Client', () => {
  it('should run inference with a simple prompt', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Say hello in exactly 3 words.' }];

    const result = await runInference(env.AI, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('should handle system messages', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Always respond with exactly one word.',
      },
      { role: 'user', content: 'What color is the sky?' },
    ];

    const result = await runInference(env.AI, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('should handle multi-turn conversation', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'My name is Alice.' },
      { role: 'assistant', content: 'Hello Alice!' },
      { role: 'user', content: 'What is my name?' },
    ];

    const result = await runInference(env.AI, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(result.response.toLowerCase()).toContain('alice');
  });
});
