/**
 * Template Rendering
 *
 * Renders Handlebars-style templates with variable substitution.
 */

/**
 * Render template with variable substitution
 *
 * Supports:
 * - {{variable}} for simple variable substitution
 * - {{json variable}} for JSON serialization of objects
 *
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context object with variable values
 * @returns Rendered string
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  // First handle {{json variable}} syntax
  let rendered = template.replace(/\{\{json\s+(\w+)\}\}/g, (match, varName) => {
    const value = context[varName];
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  });

  // Then handle regular {{variable}} syntax
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = context[varName];
    if (value === undefined || value === null) return '';
    // Auto-stringify objects that weren't explicitly marked with 'json'
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });

  return rendered;
}
