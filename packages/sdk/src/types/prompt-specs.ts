export interface PromptSpec {
  id: string;
  name: string;
  template_language: 'handlebars' | 'jinja2';
  system_template: string | null;
  user_template: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptSpecRequest {
  name: string;
  template_language: 'handlebars' | 'jinja2';
  system_template?: string;
  user_template: string;
}
