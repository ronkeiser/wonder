/** Type definitions for prompt specs */

export type PromptSpec = {
  id: string;
  name: string;
  description: string;
  version: number;
  system_prompt: string | null;
  template: string;
  template_language: 'handlebars' | 'jinja2';
  requires: object;
  produces: object;
  examples: object | null;
  tags: string[] | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptSpecInput = {
  version?: number;
  name: string;
  description?: string;
  system_prompt?: string;
  template: string;
  template_language?: 'handlebars' | 'jinja2';
  requires?: object;
  produces?: object;
  examples?: object;
  tags?: string[];
  autoversion?: boolean;
};
