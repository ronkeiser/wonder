/**
 * @wonder/templates - Main API
 *
 * Handlebars-compatible template engine for Cloudflare Workers.
 * Provides synchronous template compilation and rendering without eval() or new Function().
 */

import type { HelperRegistry } from './helpers/index';
import { Interpreter } from './interpreter/interpreter';
import { Lexer } from './lexer/lexer';
import { Parser } from './parser/parser';

/**
 * Options for template rendering.
 */
export interface RenderOptions {
  /**
   * Custom helper functions to use in templates.
   * User helpers are merged with built-in helpers and override them if names conflict.
   *
   * @example
   * ```typescript
   * const options = {
   *   helpers: {
   *     uppercase: (str: string) => str.toUpperCase(),
   *     add: (a: number, b: number) => a + b,
   *   }
   * };
   * ```
   */
  helpers?: HelperRegistry;

  /**
   * Data variables accessible via @ prefix in templates.
   * These are merged into the data frame and accessible as @foo, @bar, etc.
   *
   * @example
   * ```typescript
   * const options = {
   *   data: {
   *     timestamp: Date.now(),
   *     user: 'admin'
   *   }
   * };
   * // Template can use: {{@timestamp}} {{@user}}
   * ```
   */
  data?: Record<string, any>;
}

/**
 * Compiled template that can be rendered multiple times with different contexts.
 */
export interface CompiledTemplate {
  /**
   * Render the compiled template with the given context.
   *
   * @param context - The data object to use for template evaluation
   * @param options - Optional rendering options (helpers, etc.)
   * @returns The rendered template as a string
   */
  render(context: any, options?: RenderOptions): string;
}

/**
 * Compile a template string into a reusable compiled template.
 *
 * The compiled template can be rendered multiple times with different contexts
 * without re-parsing the template.
 *
 * @param template - The Handlebars template string to compile
 * @returns A compiled template object with a render method
 *
 * @example
 * ```typescript
 * const compiled = compile('Hello {{name}}!');
 * const result1 = compiled.render({ name: 'Alice' });
 * const result2 = compiled.render({ name: 'Bob' });
 * ```
 */
export function compile(template: string): CompiledTemplate {
  // Parse template once during compilation
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  parser.setInput(template);
  const ast = parser.parse();

  // Return compiled template with render method
  return {
    render(context: any, options?: RenderOptions): string {
      const interpreter = new Interpreter(ast, {
        helpers: options?.helpers,
      });
      return interpreter.evaluate(context, options?.data);
    },
  };
}

/**
 * Render a template string with the given context.
 *
 * This is a convenience method that compiles and renders in one step.
 * For better performance when rendering the same template multiple times,
 * use `compile()` instead.
 *
 * @param template - The Handlebars template string to render
 * @param context - The data object to use for template evaluation
 * @param options - Optional rendering options (helpers, etc.)
 * @returns The rendered template as a string
 *
 * @example
 * ```typescript
 * const result = render('Hello {{name}}!', { name: 'Alice' });
 * // result: 'Hello Alice!'
 *
 * // With custom helpers
 * const result = render(
 *   '{{uppercase name}}',
 *   { name: 'alice' },
 *   { helpers: { uppercase: (s) => s.toUpperCase() } }
 * );
 * // result: 'ALICE'
 * ```
 */
export function render(template: string, context: any, options?: RenderOptions): string {
  const compiled = compile(template);
  return compiled.render(context, options);
}

// Re-export types for convenience
export type { Helper, HelperRegistry } from './helpers/index';
export type { Program } from './parser/ast-nodes';

// Re-export SafeString for user code
export { SafeString } from './runtime/safe-string';
