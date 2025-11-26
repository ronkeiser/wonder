/** Workers AI client wrapper */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceResult {
  response: string;
}

/**
 * Run inference on a Workers AI text generation model.
 * @param ai - The Workers AI binding
 * @param modelId - Model identifier (e.g., '@cf/meta/llama-3-8b-instruct')
 * @param messages - Chat messages to send
 * @returns The model's response
 */
export async function runInference<T extends keyof AiModels>(
  ai: Ai,
  modelId: T,
  messages: ChatMessage[],
): Promise<InferenceResult> {
  const result = await ai.run(modelId, {
    messages,
  });

  // Workers AI returns { response: string } for text generation models
  if (typeof result === 'object' && result !== null && 'response' in result) {
    return { response: (result as { response: string }).response };
  }

  // Handle ReadableStream response (some models return this)
  if (result instanceof ReadableStream) {
    const reader = result.getReader();
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }
    } finally {
      reader.releaseLock();
    }

    return { response: chunks.join('') };
  }

  throw new Error(`Unexpected response format from Workers AI: ${typeof result}`);
}
