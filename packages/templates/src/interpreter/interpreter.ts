/**
 * Template Interpreter
 *
 * Tree-walking interpreter that evaluates AST nodes using context and data stacks.
 * Implements Handlebars-compatible template evaluation without code generation.
 */

import type { HelperRegistry } from '../helpers/index';
import { builtInHelpers } from '../helpers/index';
import type {
  BlockStatement,
  BooleanLiteral,
  CommentStatement,
  ContentStatement,
  Expression,
  Hash,
  MustacheStatement,
  NullLiteral,
  NumberLiteral,
  PathExpression,
  Program,
  Statement,
  StringLiteral,
  SubExpression,
  UndefinedLiteral,
} from '../parser/ast-nodes';
import { SafeString } from '../runtime/safe-string';
import { escapeExpression, isEmpty, lookupProperty } from '../runtime/utils';
import { ContextStack } from './context-stack';
import { createDataFrame } from './data-frame';
import { DataStack } from './data-stack';
import { resolvePathExpression } from './path-resolver';

/**
 * Options for configuring the interpreter.
 */
export interface InterpreterOptions {
  // Capability 6: User-provided helpers (merged with built-ins)
  helpers?: HelperRegistry;
  // Reserved for Capability 7: Partials
  partials?: Record<string, Program>;
}

/**
 * Template interpreter that evaluates AST nodes.
 *
 * Uses context and data stacks to resolve variables and maintain scope.
 * Evaluates templates without code generation (tree-walking interpretation).
 */
export class Interpreter {
  private ast: Program;
  private helpers: HelperRegistry;
  private contextStack!: ContextStack;
  private dataStack!: DataStack;
  private blockParamsStack: Array<Record<string, any>> = [];

  /**
   * Creates a new interpreter for the given AST.
   *
   * @param ast - The parsed Program AST to interpret
   * @param options - Optional configuration for helpers, partials, etc.
   */
  constructor(ast: Program, options: InterpreterOptions = {}) {
    this.ast = ast;
    // Merge user helpers with built-in helpers (user helpers override built-ins)
    this.helpers = {
      ...builtInHelpers,
      ...options.helpers,
    };
  }

  /**
   * Unwraps a value if it's a function by calling it with the current context.
   *
   * This pattern is used throughout the interpreter where a value might be
   * a function that needs to be called to get the actual value.
   *
   * @param value - The value to potentially unwrap
   * @returns The value, or the result of calling it if it's a function
   */
  private unwrapValue(value: any): any {
    if (typeof value === 'function') {
      const context = this.contextStack.getCurrent();
      return value.call(context);
    }
    return value;
  }

  /**
   * Executes a callback with a new context and optional data frame pushed onto the stacks.
   *
   * Handles the push/pop pattern that's used throughout the interpreter.
   *
   * @param newContext - The context to push (or undefined to skip context push)
   * @param dataVars - Optional data variables for the new frame
   * @param callback - The function to execute with the new scope
   * @returns The result of the callback
   */
  private withScope<T>(
    newContext: any | undefined,
    dataVars: Record<string, any> | null,
    callback: () => T,
  ): T {
    const pushContext = newContext !== undefined;
    const pushData = dataVars !== null;

    if (pushContext) {
      this.contextStack.push(newContext);
    }
    if (pushData) {
      const parentFrame = this.dataStack.getCurrent();
      const frame = createDataFrame(parentFrame, dataVars);
      this.dataStack.push(frame);
    }

    try {
      return callback();
    } finally {
      if (pushData) {
        this.dataStack.pop();
      }
      if (pushContext) {
        this.contextStack.pop();
      }
    }
  }

  /**
   * Checks if a value is falsy using Handlebars semantics.
   *
   * Matches Handlebars logic: (!value) || isEmpty(value)
   * This treats 0 as falsy (like JavaScript) while treating {} as truthy.
   *
   * @param value - The value to check
   * @returns true if the value is falsy
   */
  private isFalsy(value: any): boolean {
    return !value || isEmpty(value);
  }

  /**
   * Throws if the helper name is a blocked internal helper.
   *
   * Security: Prevent explicit calls to helperMissing/blockHelperMissing (GH-1558)
   *
   * @param name - The helper name to check
   * @throws Error if the name is blocked
   */
  private assertNotBlockedHelper(name: string): void {
    if (name === 'helperMissing' || name === 'blockHelperMissing') {
      throw new Error(`Calling '${name}' explicitly is not allowed for security reasons`);
    }
  }

  /**
   * Evaluates the template with the given context.
   *
   * Initializes stacks, traverses the AST, and returns the rendered output.
   *
   * @param context - The root context object for template evaluation
   * @param userData - Optional user-provided data variables (accessible via @)
   * @returns The rendered template as a string
   *
   * @example
   * ```typescript
   * const ast = parse('Hello {{name}}!');
   * const interpreter = new Interpreter(ast);
   * const output = interpreter.evaluate({ name: 'World' }, { timestamp: Date.now() });
   * // Can use {{name}} and {{@timestamp}} in template
   * ```
   */
  evaluate(context: any, userData?: Record<string, any>): string {
    // Initialize context stack with root context
    this.contextStack = new ContextStack();
    this.contextStack.push(context);

    // Initialize data stack with root data frame containing @root and user data
    this.dataStack = new DataStack();
    const rootData: Record<string, any> = { '@root': context };

    // Merge user-provided data variables with @ prefix
    if (userData) {
      for (const key in userData) {
        if (Object.prototype.hasOwnProperty.call(userData, key)) {
          rootData['@' + key] = userData[key];
        }
      }
    }

    const rootFrame = createDataFrame(null, rootData);
    this.dataStack.push(rootFrame);

    // Evaluate the program
    return this.evaluateProgram(this.ast);
  }

  /**
   * Evaluates a Program node by processing its statements.
   * Also applies whitespace control based on strip flags.
   *
   * @param program - The Program node to evaluate (or null)
   * @param stripFlags - Optional strip flags for block boundaries
   * @returns The concatenated output from all statements
   */
  private evaluateProgram(
    program: Program | null,
    stripFlags?: { stripStart?: boolean; stripEnd?: boolean },
  ): string {
    if (program === null) {
      return '';
    }

    // Apply whitespace stripping based on strip flags
    let strippedBody = this.applyWhitespaceControl(program.body);

    // Apply boundary stripping if specified
    if (stripFlags) {
      // Strip leading whitespace from first statement if stripStart is true
      if (stripFlags.stripStart && strippedBody.length > 0) {
        const first = strippedBody[0];
        if (first.type === 'ContentStatement') {
          strippedBody = [
            {
              ...first,
              value: first.value.replace(/^\s+/, ''),
            },
            ...strippedBody.slice(1),
          ];
        }
      }

      // Strip trailing whitespace from last statement if stripEnd is true
      if (stripFlags.stripEnd && strippedBody.length > 0) {
        const lastIndex = strippedBody.length - 1;
        const last = strippedBody[lastIndex];
        if (last.type === 'ContentStatement') {
          strippedBody = [
            ...strippedBody.slice(0, lastIndex),
            {
              ...last,
              value: last.value.replace(/\s+$/, ''),
            },
          ];
        }
      }
    }

    const results: string[] = [];
    for (const statement of strippedBody) {
      results.push(this.evaluateStatement(statement));
    }

    return results.join('');
  }

  /**
   * Apply whitespace control by modifying ContentStatement values
   * based on adjacent MustacheStatement/BlockStatement strip flags.
   *
   * @param body - Array of statements to process
   * @returns Modified array with whitespace stripping applied
   */
  private applyWhitespaceControl(body: Statement[]): Statement[] {
    if (body.length === 0) {
      return body;
    }

    // Clone the array to avoid mutating the original AST
    const result = [...body];

    for (let i = 0; i < result.length; i++) {
      const current = result[i];
      const prev = i > 0 ? result[i - 1] : null;
      const next = i < result.length - 1 ? result[i + 1] : null;

      // If current is content and previous statement has close strip, strip leading whitespace
      if (current.type === 'ContentStatement' && prev) {
        const prevStripClose = this.getCloseStripFlag(prev);
        if (prevStripClose) {
          result[i] = {
            ...current,
            value: current.value.replace(/^\s+/, ''),
          };
        }
      }

      // If current is content and next statement has open strip, strip trailing whitespace
      if (current.type === 'ContentStatement' && next) {
        const nextStripOpen = this.getOpenStripFlag(next);
        if (nextStripOpen) {
          // Need to re-read current in case it was modified above
          const currentContent = result[i] as ContentStatement;
          result[i] = {
            ...currentContent,
            value: currentContent.value.replace(/\s+$/, ''),
          };
        }
      }
    }

    return result;
  }

  /**
   * Get the "open strip" flag from a statement (strip whitespace before)
   */
  private getOpenStripFlag(statement: Statement): boolean {
    if (statement.type === 'MustacheStatement') {
      return statement.strip?.open ?? false;
    }
    if (statement.type === 'BlockStatement') {
      return statement.openStrip?.open ?? false;
    }
    return false;
  }

  /**
   * Get the "close strip" flag from a statement (strip whitespace after)
   */
  private getCloseStripFlag(statement: Statement): boolean {
    if (statement.type === 'MustacheStatement') {
      return statement.strip?.close ?? false;
    }
    if (statement.type === 'BlockStatement') {
      return statement.closeStrip?.close ?? false;
    }
    return false;
  }

  /**
   * Routes a statement to its specific evaluator based on type.
   *
   * @param statement - The statement to evaluate
   * @returns The output from the statement
   */
  private evaluateStatement(statement: Statement): string {
    switch (statement.type) {
      case 'ContentStatement':
        return this.evaluateContent(statement);
      case 'MustacheStatement':
        return this.evaluateMustache(statement);
      case 'BlockStatement':
        return this.evaluateBlock(statement);
      case 'CommentStatement':
        return this.evaluateComment(statement);
      default:
        throw new Error(`Unknown statement type: ${(statement as any).type}`);
    }
  }

  /**
   * Evaluates a ContentStatement (plain text).
   *
   * @param node - The ContentStatement node
   * @returns The literal text content
   */
  private evaluateContent(node: ContentStatement): string {
    return node.value;
  }

  /**
   * Evaluates a MustacheStatement (variable output or helper call).
   *
   * Uses helper detection to determine if this is a helper call or variable lookup.
   * Resolves the value, converts to string, and applies HTML escaping if needed.
   *
   * @param node - The MustacheStatement node
   * @returns The output string (escaped or unescaped)
   */
  private evaluateMustache(node: MustacheStatement): string {
    let value: any;

    // Security: Prevent explicit calls to helperMissing/blockHelperMissing (GH-1558)
    this.assertNotBlockedHelper(node.path.parts[0]);

    if (this.isHelperCall(node)) {
      // Call helper
      const helperName = node.path.parts[0];

      const helper = this.lookupHelper(helperName);
      if (!helper) {
        // Fallback: try to resolve as context function (Feature 7.1)
        value = this.evaluatePathExpression(node.path);
        if (typeof value === 'function') {
          // Call the context function with parameters
          const args = node.params.map((param) => this.evaluateExpression(param));
          const context = this.contextStack.getCurrent();
          value = value.call(context, ...args);
        } else {
          // Not a function, error
          throw new Error(`Unknown helper: ${helperName}`);
        }
      } else {
        // Security: Validate helper is actually a function (GH-1595)
        if (typeof helper !== 'function') {
          throw new Error(
            `'${helperName}' is not a valid helper function (found: ${typeof helper})`,
          );
        }

        const args = node.params.map((param) => this.evaluateExpression(param));
        const hash = this.evaluateHash(node.hash);
        const options = { hash };
        const context = this.contextStack.getCurrent();
        value = helper.call(context, ...args, options);
      }
    } else {
      // Variable lookup
      value = this.evaluatePathExpression(node.path);

      // Feature 7.1: If value is a function, call it automatically
      if (typeof value === 'function') {
        const context = this.contextStack.getCurrent();
        value = value.call(context);
      }
    }

    // Handle null/undefined - return empty string
    if (value == null) {
      return '';
    }

    // Feature 7.7: SafeString bypasses escaping even in escaped context
    if (value instanceof SafeString) {
      return value.toString();
    }

    // Convert to string
    const stringValue = String(value);

    // Apply escaping based on node.escaped
    if (node.escaped) {
      // {{foo}} - escaped output
      return escapeExpression(stringValue);
    } else {
      // {{{foo}}} - unescaped output
      return stringValue;
    }
  }

  /**
   * Evaluates a BlockStatement (block helper).
   *
   * Dispatches to specific block helper implementations based on helper name.
   *
   * @param node - The BlockStatement node
   * @returns The rendered output from the block helper
   */
  private evaluateBlock(node: BlockStatement): string {
    // Get the helper name from the path
    const helperName = node.path.original;

    // Security: Prevent explicit calls to helperMissing/blockHelperMissing (GH-1558)
    this.assertNotBlockedHelper(helperName);

    // Dispatch to specific block helper
    switch (helperName) {
      case 'if':
        return this.evaluateIfHelper(node);
      case 'unless':
        return this.evaluateUnlessHelper(node);
      case 'each':
        return this.evaluateEachHelper(node);
      case 'with':
        return this.evaluateWithHelper(node);
      default:
        // Check for registered custom block helper
        const helper = this.lookupHelper(helperName);
        if (helper && typeof helper === 'function') {
          return this.evaluateCustomBlockHelper(node, helper);
        }

        // Feature 7.2: Implicit block iteration - try context lookup
        return this.evaluateImplicitBlock(node);
    }
  }

  /**
   * Evaluates an implicit block (Feature 7.2).
   *
   * When a block helper name doesn't match a built-in helper, try to resolve it
   * as a context value. If it's an array, iterate. If it's a boolean, use as condition.
   * If it's a function, call it with an options object.
   *
   * @param node - The BlockStatement node
   * @returns The rendered output from the implicit block
   */
  private evaluateImplicitBlock(node: BlockStatement): string {
    // Resolve the path as a context value
    const value = this.evaluatePathExpression(node.path);

    // Define strip flags for reuse
    const programStrip = { stripStart: node.openStrip?.close, stripEnd: node.closeStrip?.open };
    const inverseStrip = { stripStart: node.inverseStrip?.open, stripEnd: node.closeStrip?.open };

    // Array: iterate like #each
    if (Array.isArray(value)) {
      if (value.length === 0) {
        // Empty array renders inverse block
        return this.evaluateProgram(node.inverse, inverseStrip);
      }

      const results: string[] = [];
      for (let i = 0; i < value.length; i++) {
        results.push(
          this.withScope(
            value[i],
            {
              '@index': i,
              '@first': i === 0,
              '@last': i === value.length - 1,
            },
            () => this.evaluateProgram(node.program, programStrip),
          ),
        );
      }

      return results.join('');
    }

    // Boolean: use as condition
    if (typeof value === 'boolean') {
      if (value) {
        return this.evaluateProgram(node.program, programStrip);
      } else {
        return this.evaluateProgram(node.inverse, inverseStrip);
      }
    }

    // Function: call with options object
    if (typeof value === 'function') {
      const context = this.contextStack.getCurrent();
      const params = node.params.map((param) => this.evaluateExpression(param));

      // Create options object with fn and inverse closures
      const options = {
        fn: (newContext?: any) => {
          return this.withScope(newContext, null, () =>
            this.evaluateProgram(node.program, programStrip),
          );
        },
        inverse: () => {
          return this.evaluateProgram(node.inverse, inverseStrip);
        },
        data: this.dataStack.getCurrent(),
        hash: {},
      };

      // Call the function with params and options
      const result = value.call(context, ...params, options);

      // If function returned a string, use it as the output
      if (typeof result === 'string') {
        return result;
      }

      // Otherwise, use return value as context/condition
      // Falsy: render inverse
      if (this.isFalsy(result)) {
        return this.evaluateProgram(node.inverse, inverseStrip);
      }

      // Truthy: render main block with result as new context (if object/array)
      if (typeof result === 'object') {
        return this.withScope(result, null, () => this.evaluateProgram(node.program, programStrip));
      }

      // Other truthy primitives: just render the block
      return this.evaluateProgram(node.program, programStrip);
    }

    // Falsy or missing: render inverse block
    if (this.isFalsy(value)) {
      return this.evaluateProgram(node.inverse, inverseStrip);
    }

    // Other truthy values: render main block
    return this.evaluateProgram(node.program, programStrip);
  }

  /**
   * Evaluates a custom registered block helper.
   *
   * Calls the helper function with parameters and an options object containing
   * fn() and inverse() functions for rendering the block content.
   *
   * @param node - The BlockStatement node
   * @param helper - The registered helper function
   * @returns The rendered output from the helper
   */
  private evaluateCustomBlockHelper(node: BlockStatement, helper: (...args: any[]) => any): string {
    const context = this.contextStack.getCurrent();
    const params = node.params.map((param) => this.evaluateExpression(param));
    const hash = this.evaluateHash(node.hash);

    // Create fn closure that accepts optional context and options with blockParams
    const fn = (newContext?: any, opts?: { blockParams?: any[] }) => {
      return this.withScope(newContext, null, () => {
        // If block params are provided by the helper, store them on the block params stack
        if (opts?.blockParams && node.blockParams) {
          const blockParamBindings: Record<string, any> = {};
          node.blockParams.forEach((paramName, i) => {
            if (i < opts.blockParams!.length) {
              blockParamBindings[paramName] = opts.blockParams![i];
            }
          });
          // Push block param bindings before evaluating program
          this.blockParamsStack.push(blockParamBindings);
          try {
            return this.evaluateProgram(node.program, {
              stripStart: node.openStrip?.close,
              stripEnd: node.closeStrip?.open,
            });
          } finally {
            this.blockParamsStack.pop();
          }
        }

        // No block params, just evaluate normally
        return this.evaluateProgram(node.program, {
          stripStart: node.openStrip?.close,
          stripEnd: node.closeStrip?.open,
        });
      });
    };

    // Add blockParams property to fn (tells helper how many block params are expected)
    if (node.blockParams) {
      (fn as any).blockParams = node.blockParams.length;
    }

    // Create options object with fn, inverse closures, and hash
    const options = {
      fn,
      inverse: (newContext?: any) => {
        return this.withScope(newContext, null, () =>
          this.evaluateProgram(node.inverse, {
            stripStart: node.inverseStrip?.open,
            stripEnd: node.closeStrip?.open,
          }),
        );
      },
      hash,
    };

    // Call helper with params + options as last argument
    const result = helper.call(context, ...params, options);

    // Return the result (helper is responsible for calling options.fn/inverse)
    return result == null ? '' : String(result);
  }

  /**
   * Evaluates the #if block helper.
   *
   * Matches Handlebars logic: (!condition) || isEmpty(condition)
   * This treats 0 as falsy (like JavaScript) while treating {} as truthy.
   *
   * @param node - The BlockStatement node for #if
   * @returns The rendered output based on the condition
   */
  private evaluateIfHelper(node: BlockStatement): string {
    return this.evaluateConditionalHelper(node, 'if', false);
  }

  private evaluateUnlessHelper(node: BlockStatement): string {
    return this.evaluateConditionalHelper(node, 'unless', true);
  }

  /**
   * Shared implementation for #if and #unless helpers.
   *
   * @param node - The BlockStatement node
   * @param helperName - The helper name for error messages
   * @param invert - If true, inverts the condition (for #unless)
   * @returns The rendered output based on the condition
   */
  private evaluateConditionalHelper(
    node: BlockStatement,
    helperName: string,
    invert: boolean,
  ): string {
    if (node.params.length !== 1) {
      throw new Error(
        `#${helperName} helper requires exactly 1 parameter, got ${node.params.length}`,
      );
    }

    const condition = this.unwrapValue(this.evaluateExpression(node.params[0]));

    // Check for includeZero hash option
    const hash = this.evaluateHash(node.hash);
    const includeZero = hash.includeZero === true;

    // When includeZero is true, treat 0 as truthy
    const isFalsy = includeZero && condition === 0 ? false : this.isFalsy(condition);
    const renderInverse = invert ? !isFalsy : isFalsy;

    // Detect if this is an inverse block statement ({{^if}} instead of {{#if}})
    // In inverse blocks, program.body is empty and content is in inverse
    const isInverseBlock = node.program?.body.length === 0 && node.inverse !== null;

    // Determine if there's an else clause (not an inverse block)
    const hasElseClause = !isInverseBlock && node.inverse !== null;

    if (renderInverse) {
      // When rendering inverse, use inverseStrip flags
      // UNLESS it's an inverse block statement, in which case use openStrip
      return this.evaluateProgram(node.inverse, {
        stripStart: isInverseBlock ? node.openStrip?.close : node.inverseStrip?.close,
        stripEnd: node.closeStrip?.open,
      });
    } else {
      return this.evaluateProgram(node.program, {
        stripStart: node.openStrip?.close,
        stripEnd: hasElseClause ? node.inverseStrip?.open : node.closeStrip?.open,
      });
    }
  }

  /**
   * Evaluates the #each block helper.
   *
   * Iterates over arrays or objects, providing loop metadata via data variables.
   * For arrays: provides @index, @first, @last
   * For objects: provides @key, @index, @first, @last
   *
   * @param node - The BlockStatement node for #each
   * @returns The rendered output from iterations, or inverse block if empty
   */
  private evaluateEachHelper(node: BlockStatement): string {
    // #each requires exactly 1 parameter (the collection)
    if (node.params.length !== 1) {
      throw new Error(`#each helper requires exactly 1 parameter, got ${node.params.length}`);
    }

    // Evaluate the collection parameter (unwrap if it's a function)
    const collection = this.unwrapValue(this.evaluateExpression(node.params[0]));

    // Handle arrays
    if (Array.isArray(collection)) {
      return this.evaluateEachArray(node, collection);
    }

    // Handle Map objects
    if (collection instanceof Map) {
      return this.evaluateEachMap(node, collection);
    }

    // Handle Set objects
    if (collection instanceof Set) {
      return this.evaluateEachSet(node, collection);
    }

    // Handle objects
    if (collection !== null && typeof collection === 'object') {
      return this.evaluateEachObject(node, collection);
    }

    // For null, undefined, or other non-iterables, render inverse block
    return this.evaluateProgram(node.inverse, {
      stripStart: node.inverseStrip?.open,
      stripEnd: node.closeStrip?.open,
    });
  }

  /**
   * Evaluates #each for array iteration.
   *
   * @param node - The BlockStatement node
   * @param collection - The array to iterate over
   * @returns The concatenated output from all iterations
   */
  private evaluateEachArray(node: BlockStatement, collection: any[]): string {
    // Empty arrays render the inverse block ({{else}})
    if (collection.length === 0) {
      return this.evaluateProgram(node.inverse, {
        stripStart: node.inverseStrip?.open,
        stripEnd: node.closeStrip?.open,
      });
    }

    // For sparse arrays, we need to find the first and last actual indices
    let firstIndex = -1;
    let lastIndex = -1;

    for (let i = 0; i < collection.length; i++) {
      if (i in collection) {
        if (firstIndex === -1) {
          firstIndex = i;
        }
        lastIndex = i;
      }
    }

    let output = '';

    // Iterate over array indices
    for (let i = 0; i < collection.length; i++) {
      // Skip sparse array holes
      if (!(i in collection)) {
        continue;
      }

      // If block params are defined, use them
      if (node.blockParams && node.blockParams.length > 0) {
        const blockParamBindings: Record<string, any> = {
          [node.blockParams[0]]: collection[i],
        };
        if (node.blockParams.length > 1) {
          blockParamBindings[node.blockParams[1]] = i;
        }

        this.blockParamsStack.push(blockParamBindings);
        try {
          const dataVars = {
            '@index': i,
            '@first': i === firstIndex,
            '@last': i === lastIndex,
          };
          // Push data frame for @index, @first, @last
          this.dataStack.push(createDataFrame(this.dataStack.getCurrent(), dataVars));
          try {
            output += this.evaluateProgram(node.program, {
              stripStart: node.openStrip?.close,
              stripEnd: node.closeStrip?.open,
            });
          } finally {
            this.dataStack.pop();
          }
        } finally {
          this.blockParamsStack.pop();
        }
      } else {
        // No block params - standard behavior (change context)
        output += this.withScope(
          collection[i],
          {
            '@index': i,
            '@first': i === firstIndex,
            '@last': i === lastIndex,
          },
          () =>
            this.evaluateProgram(node.program, {
              stripStart: node.openStrip?.close,
              stripEnd: node.closeStrip?.open,
            }),
        );
      }
    }

    return output;
  }

  /**
   * Evaluates #each for object iteration.
   *
   * @param node - The BlockStatement node
   * @param collection - The object to iterate over
   * @returns The concatenated output from all property iterations
   */
  private evaluateEachObject(node: BlockStatement, collection: object): string {
    // Use Reflect.ownKeys() to preserve insertion order for all property types
    // Filter to only enumerable own properties (like Object.keys() does)
    const keys = Reflect.ownKeys(collection)
      .filter((key) => Object.prototype.propertyIsEnumerable.call(collection, key))
      .map((key) => String(key));

    // Empty objects render the inverse block ({{else}})
    if (keys.length === 0) {
      return this.evaluateProgram(node.inverse, {
        stripStart: node.inverseStrip?.open,
        stripEnd: node.closeStrip?.open,
      });
    }

    let output = '';

    // Iterate over keys with index
    keys.forEach((key, index) => {
      output += this.withScope(
        (collection as any)[key],
        {
          '@key': key,
          '@index': index,
          '@first': index === 0,
          '@last': index === keys.length - 1,
        },
        () =>
          this.evaluateProgram(node.program, {
            stripStart: node.openStrip?.close,
            stripEnd: node.closeStrip?.open,
          }),
      );
    });

    return output;
  }

  /**
   * Evaluates #each for Map iteration.
   *
   * @param node - The BlockStatement node
   * @param collection - The Map to iterate over
   * @returns The concatenated output from all entry iterations
   */
  private evaluateEachMap(node: BlockStatement, collection: Map<any, any>): string {
    // Empty maps render the inverse block ({{else}})
    if (collection.size === 0) {
      return this.evaluateProgram(node.inverse, {
        stripStart: node.inverseStrip?.open,
        stripEnd: node.closeStrip?.open,
      });
    }

    let output = '';
    const entries = Array.from(collection.entries());

    // Iterate over Map entries
    entries.forEach(([key, value], index) => {
      output += this.withScope(
        value,
        {
          '@key': key,
          '@index': index,
          '@first': index === 0,
          '@last': index === entries.length - 1,
        },
        () =>
          this.evaluateProgram(node.program, {
            stripStart: node.openStrip?.close,
            stripEnd: node.closeStrip?.open,
          }),
      );
    });

    return output;
  }

  /**
   * Evaluates #each for Set iteration.
   *
   * @param node - The BlockStatement node
   * @param collection - The Set to iterate over
   * @returns The concatenated output from all value iterations
   */
  private evaluateEachSet(node: BlockStatement, collection: Set<any>): string {
    // Empty sets render the inverse block ({{else}})
    if (collection.size === 0) {
      return this.evaluateProgram(node.inverse, {
        stripStart: node.inverseStrip?.open,
        stripEnd: node.closeStrip?.open,
      });
    }

    let output = '';
    const values = Array.from(collection.values());

    // Iterate over Set values
    values.forEach((value, index) => {
      output += this.withScope(
        value,
        {
          // For Sets, @key is same as @index (but as string for consistency)
          '@key': String(index),
          '@index': index,
          '@first': index === 0,
          '@last': index === values.length - 1,
        },
        () =>
          this.evaluateProgram(node.program, {
            stripStart: node.openStrip?.close,
            stripEnd: node.closeStrip?.open,
          }),
      );
    });

    return output;
  }

  /**
   * Evaluates the #with block helper.
   *
   * Changes the current context to the resolved value, allowing cleaner
   * access to nested properties. Renders else block if value is falsy.
   *
   * @param node - The BlockStatement node for #with
   * @returns The rendered output from the block, or inverse block if falsy
   */
  private evaluateWithHelper(node: BlockStatement): string {
    // #with requires exactly 1 parameter (the path to establish as context)
    if (node.params.length !== 1) {
      throw new Error(`#with helper requires exactly 1 parameter, got ${node.params.length}`);
    }

    // Evaluate the parameter to get the value (unwrap if it's a function)
    const value = this.unwrapValue(this.evaluateExpression(node.params[0]));

    if (this.isFalsy(value)) {
      return this.evaluateProgram(node.inverse, {
        stripStart: node.inverseStrip?.open,
        stripEnd: node.closeStrip?.open,
      });
    }

    // If block params are defined, bind them AND still push the value as context
    if (node.blockParams && node.blockParams.length > 0) {
      const blockParamBindings: Record<string, any> = {
        [node.blockParams[0]]: value,
      };
      this.blockParamsStack.push(blockParamBindings);
      try {
        // Still push value as context so unbound names resolve from it
        return this.withScope(value, {}, () =>
          this.evaluateProgram(node.program, {
            stripStart: node.openStrip?.close,
            stripEnd: node.closeStrip?.open,
          }),
        );
      } finally {
        this.blockParamsStack.pop();
      }
    }

    // No block params - push value as new context and data frame (inherits @root but no new loop variables)
    return this.withScope(value, {}, () =>
      this.evaluateProgram(node.program, {
        stripStart: node.openStrip?.close,
        stripEnd: node.closeStrip?.open,
      }),
    );
  }

  /**
   * Evaluates a CommentStatement.
   *
   * Comments produce no output in Handlebars.
   *
   * @param _node - The CommentStatement node
   * @returns Empty string
   */
  private evaluateComment(_node: CommentStatement): string {
    return '';
  }

  /**
   * Evaluates an expression and returns its value.
   *
   * Routes to specific evaluators based on expression type.
   *
   * @param expr - The expression to evaluate
   * @returns The resolved value (not converted to string)
   */
  private evaluateExpression(expr: Expression): any {
    switch (expr.type) {
      case 'PathExpression':
        return this.evaluatePathExpression(expr);
      case 'StringLiteral':
      case 'NumberLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
      case 'UndefinedLiteral':
        return this.evaluateLiteral(expr);
      case 'SubExpression':
        return this.evaluateSubExpression(expr);
      default:
        throw new Error(`Unknown expression type: ${(expr as any).type}`);
    }
  }

  /**
   * Looks up a helper function in the helper registry.
   *
   * @param name - The helper name to look up
   * @returns The helper function if found, undefined otherwise
   */
  private lookupHelper(name: string): ((...args: any[]) => any) | undefined {
    // Security: Use lookupProperty to prevent accessing dangerous prototype properties
    const helper = lookupProperty(this.helpers, name);
    return typeof helper === 'function' ? helper : undefined;
  }

  /**
   * Determines if a MustacheStatement or BlockStatement should be treated as a helper call.
   *
   * Rules (from Handlebars):
   * 1. If statement has params → always a helper call
   * 2. If path is scoped (starts with ./ or this.) → always variable lookup
   * 3. If helper exists in registry → helper call
   * 4. Otherwise → variable lookup
   *
   * @param node - The MustacheStatement or BlockStatement to check
   * @returns true if this should be treated as a helper call
   */
  private isHelperCall(node: MustacheStatement | BlockStatement): boolean {
    // Has params? Always a helper call
    if (node.params.length > 0) {
      return true;
    }

    // Scoped path? Never a helper (always variable lookup)
    if (this.isScopedPath(node.path)) {
      return false;
    }

    const helperName = node.path.parts[0];

    // Block params shadow helpers for simple identifiers
    // Check if this is a simple identifier that's in block params
    const isSimpleIdentifier =
      !node.path.data &&
      node.path.depth === 0 &&
      node.path.parts.length === 1 &&
      !node.path.original.startsWith('./') &&
      !node.path.original.startsWith('../');

    if (isSimpleIdentifier && this.blockParamsStack.length > 0) {
      // Check if this identifier is in block params (from inner to outer scope)
      for (let i = this.blockParamsStack.length - 1; i >= 0; i--) {
        if (helperName in this.blockParamsStack[i]) {
          // It's a block param, not a helper
          return false;
        }
      }
    }

    // Check if helper exists in registry
    return this.lookupHelper(helperName) !== undefined;
  }

  /**
   * Checks if a path expression is scoped (explicit context reference).
   *
   * Scoped paths start with ./ or this. and always refer to context variables,
   * never helpers.
   *
   * @param path - The PathExpression to check
   * @returns true if the path is scoped
   */
  private isScopedPath(path: PathExpression): boolean {
    return path.original.startsWith('./') || path.original.startsWith('this.');
  }

  /**
   * Evaluates a SubExpression (helper call) by recursively evaluating parameters
   * and calling the helper function.
   *
   * @param expr - The SubExpression to evaluate
   * @returns The result from the helper function
   */
  private evaluateSubExpression(expr: SubExpression): any {
    // Get helper name from path
    const helperName = expr.path.parts[0];

    // Look up helper in registry
    const helper = this.lookupHelper(helperName);
    if (!helper) {
      // Fallback: try to resolve as context value (Feature 7.4)
      const value = this.evaluatePathExpression(expr.path);
      if (typeof value === 'function') {
        // Call the context function with parameters
        const args = expr.params.map((param) => this.evaluateExpression(param));
        const context = this.contextStack.getCurrent();
        return value.call(context, ...args);
      }
      // Not a function, throw error
      throw new Error(`Unknown helper: ${helperName}`);
    }

    // Evaluate all parameters recursively
    const args = expr.params.map((param) => this.evaluateExpression(param));

    // Call helper with current context as 'this' binding
    const context = this.contextStack.getCurrent();
    return helper.call(context, ...args);
  }

  /**
   * Evaluates a PathExpression using block params, context, and data stacks.
   *
   * Block params shadow the first part of paths (not starting with ./ or ../), so:
   * - {{foo}} checks block params first for 'foo'
   * - {{foo.bar}} checks block params first for 'foo', then accesses .bar
   * - {{./foo}} skips block params (explicit context reference)
   * - {{../foo}} skips block params (parent context)
   * - {{@foo}} skips block params (data variable)
   *
   * @param expr - The PathExpression to evaluate
   * @returns The resolved value from block params, context, or data
   */
  private evaluatePathExpression(expr: PathExpression): any {
    // Check if the first part of the path can be shadowed by block params
    // Block params can shadow the first segment of any path, not just single identifiers
    const canUsesBlockParams =
      !expr.data &&
      expr.depth === 0 &&
      !expr.original.startsWith('./') &&
      !expr.original.startsWith('../');

    if (canUsesBlockParams && this.blockParamsStack.length > 0 && expr.parts.length > 0) {
      const firstPart = expr.parts[0];

      // Check block params from most recent to oldest (inner to outer scope)
      for (let i = this.blockParamsStack.length - 1; i >= 0; i--) {
        const blockParams = this.blockParamsStack[i];
        if (firstPart in blockParams) {
          // Found block param - resolve the first part from block params
          let value = blockParams[firstPart];

          // If there are additional parts (e.g., foo.bar.baz), resolve them
          for (let j = 1; j < expr.parts.length; j++) {
            if (value == null) {
              return undefined;
            }
            value = lookupProperty(value, expr.parts[j]);
          }

          return value;
        }
      }
    }

    // Fall back to normal resolution (context or data stack)
    return resolvePathExpression(expr, this.contextStack, this.dataStack);
  }

  /**
   * Evaluates a literal expression and returns its value.
   *
   * @param expr - The literal expression
   * @returns The literal value
   */
  private evaluateLiteral(
    expr: StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral | UndefinedLiteral,
  ): any {
    return expr.value;
  }

  /**
   * Evaluates a Hash node into a plain object with evaluated values.
   *
   * @param hash - The Hash node from the AST
   * @returns Object with key-value pairs
   */
  private evaluateHash(hash: Hash): Record<string, any> {
    const result: Record<string, any> = {};
    for (const pair of hash.pairs) {
      result[pair.key] = this.evaluateExpression(pair.value);
    }
    return result;
  }
}
