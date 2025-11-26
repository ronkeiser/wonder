import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInference, type ChatMessage } from '../../src/infrastructure/clients/workers-ai';

/**
 * Creates a mock AI binding for testing.
 * Workers AI has no local simulator, so we mock the binding.
 */
function createMockAi(response: string): Ai {
  return {
    run: vi.fn().mockResolvedValue({ response }),
  } as unknown as Ai;
}

describe('Workers AI Client', () => {
  let mockAi: Ai;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run inference with a simple prompt', async () => {
    mockAi = createMockAi('Hello there friend!');
    const messages: ChatMessage[] = [{ role: 'user', content: 'Say hello in exactly 3 words.' }];

    const result = await runInference(mockAi, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response).toBe('Hello there friend!');
    expect(mockAi.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', { messages });
  });

  it('should handle system messages', async () => {
    mockAi = createMockAi('Blue');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Always respond with exactly one word.',
      },
      { role: 'user', content: 'What color is the sky?' },
    ];

    const result = await runInference(mockAi, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response).toBe('Blue');
    expect(mockAi.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', { messages });
  });

  it('should handle multi-turn conversation', async () => {
    mockAi = createMockAi('Your name is Alice.');
    const messages: ChatMessage[] = [
      { role: 'user', content: 'My name is Alice.' },
      { role: 'assistant', content: 'Hello Alice!' },
      { role: 'user', content: 'What is my name?' },
    ];

    const result = await runInference(mockAi, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result).toBeDefined();
    expect(result.response.toLowerCase()).toContain('alice');
    expect(mockAi.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', { messages });
  });

  it('should handle ReadableStream response', async () => {
    const streamChunks = ['Hello', ' ', 'World'];
    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of streamChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    mockAi = {
      run: vi.fn().mockResolvedValue(mockStream),
    } as unknown as Ai;

    const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];
    const result = await runInference(mockAi, '@cf/meta/llama-3-8b-instruct', messages);

    expect(result.response).toBe('Hello World');
  });

  it('should throw on unexpected response format', async () => {
    mockAi = {
      run: vi.fn().mockResolvedValue(12345),
    } as unknown as Ai;

    const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

    await expect(runInference(mockAi, '@cf/meta/llama-3-8b-instruct', messages)).rejects.toThrow(
      'Unexpected response format from Workers AI',
    );
  });
});
