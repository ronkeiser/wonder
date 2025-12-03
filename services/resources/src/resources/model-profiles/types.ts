/** Type definitions for model profiles */

export type ModelProfile = {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';
  model_name: string;
  config: object;
};
