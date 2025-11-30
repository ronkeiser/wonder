export interface PromptSpec {
  id: string;
  name: string;
  description: string;
  version: number;
  template_language: 'handlebars' | 'jinja2';
  system_prompt: string | null;
  template: string;
  requires: unknown | null;
  produces: unknown | null;
  examples: unknown | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptSpecRequest {
  name: string;
  description?: string;
  template_language: 'handlebars' | 'jinja2';
  system_prompt?: string;
  template: string;
  requires?: unknown;
  produces?: unknown;
  examples?: unknown;
  tags?: string[];
}
