/**
 * Template Interpreter
 *
 * Tree-walking interpreter that evaluates AST nodes using context and data stacks.
 * Implements Handlebars-compatible template evaluation without code generation.
 */

import type { HelperRegistry } from '../helpers/index.js';
import { builtInHelpers } from '../helpers/index.js';
import type {
  BlockStatement,
  BooleanLiteral,
  CommentStatement,
  ContentStatement,
  Expression,
  MustacheStatement,
  NullLiteral,
  NumberLiteral,
  PathExpression,
  Program,
  Statement,
  StringLiteral,
  SubExpression,
  UndefinedLiteral,
} from '../parser/ast-nodes.js';
import { SafeString } from '../runtime/safe-string.js';
import { escapeExpression, isEmpty } from '../runtime/utils.js';
import { ContextStack } from './context-stack.js';
import { createDataFrame } from './data-frame.js';
import { DataStack } from './data-stack.js';
import { resolvePathExpression } from './path-resolver.js';

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
   * Evaluates the template with the given context.
   *
   * Initializes stacks, traverses the AST, and returns the rendered output.
   *
   * @param context - The root context object for template evaluation
   * @returns The rendered template as a string
   *
   * @example
   * ```typescript
   * const ast = parse('Hello {{name}}!');
   * const interpreter = new Interpreter(ast);
   * const output = interpreter.evaluate({ name: 'World' });
   * // output: "Hello World!"
   * ```
   */
  evaluate(context: any): string {
    // Initialize context stack with root context
    this.contextStack = new ContextStack();
    this.contextStack.push(context);

    // Initialize data stack with root data frame containing @root
    this.dataStack = new DataStack();
    const rootFrame = createDataFrame(null, { '@root': context });
    this.dataStack.push(rootFrame);

    // Evaluate the program
    return this.evaluateProgram(this.ast);
  }

  /**
   * Evaluates a Program node by processing its statements.
   *
   * @param program - The Program node to evaluate (or null)
   * @returns The concatenated output from all statements
   */
  private evaluateProgram(program: Program | null): string {
    if (program === null) {
      return '';
    }

    const results: string[] = [];
    for (const statement of program.body) {
      results.push(this.evaluateStatement(statement));
    }

    return results.join('');
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
        const args = node.params.map((param) => this.evaluateExpression(param));
        const context = this.contextStack.getCurrent();
        value = helper.call(context, ...args);
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

    // Array: iterate like #each
    if (Array.isArray(value)) {
      if (value.length === 0) {
        // Empty array renders inverse block
        return this.evaluateProgram(node.inverse);
      }

      const results: string[] = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];

        // Create data frame with loop metadata
        const dataFrame = createDataFrame(this.dataStack.getCurrent(), {
          '@index': i,
          '@first': i === 0,
          '@last': i === value.length - 1,
        });

        // Push item as context and data frame
        this.contextStack.push(item);
        this.dataStack.push(dataFrame);

        // Evaluate the block
        results.push(this.evaluateProgram(node.program));

        // Pop stacks
        this.dataStack.pop();
        this.contextStack.pop();
      }

      return results.join('');
    }

    // Boolean: use as condition
    if (typeof value === 'boolean') {
      if (value) {
        return this.evaluateProgram(node.program);
      } else {
        return this.evaluateProgram(node.inverse);
      }
    }

    // Function: call with options object
    if (typeof value === 'function') {
      const context = this.contextStack.getCurrent();
      const params = node.params.map((param) => this.evaluateExpression(param));

      // Create options object with fn and inverse closures
      const options = {
        fn: (newContext?: any) => {
          if (newContext !== undefined) {
            this.contextStack.push(newContext);
          }
          const result = this.evaluateProgram(node.program);
          if (newContext !== undefined) {
            this.contextStack.pop();
          }
          return result;
        },
        inverse: () => {
          return this.evaluateProgram(node.inverse);
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
      if (!result || isEmpty(result)) {
        return this.evaluateProgram(node.inverse);
      }

      // Truthy: render main block with result as new context (if object/array)
      if (typeof result === 'object') {
        this.contextStack.push(result);
        const output = this.evaluateProgram(node.program);
        this.contextStack.pop();
        return output;
      }

      // Other truthy primitives: just render the block
      return this.evaluateProgram(node.program);
    }

    // Falsy or missing: render inverse block
    if (!value || isEmpty(value)) {
      return this.evaluateProgram(node.inverse);
    }

    // Other truthy values: render main block
    return this.evaluateProgram(node.program);
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
    // #if requires exactly 1 parameter (the condition)
    if (node.params.length !== 1) {
      throw new Error(`#if helper requires exactly 1 parameter, got ${node.params.length}`);
    }

    // Evaluate the condition
    const condition = this.evaluateExpression(node.params[0]);

    // Match Handlebars #if logic: (!conditional) || isEmpty(conditional)
    // This makes 0 falsy (standard JS) while keeping {} truthy
    const isFalsy = !condition || isEmpty(condition);

    if (isFalsy) {
      // Render the inverse block ({{else}}) if present
      return this.evaluateProgram(node.inverse);
    } else {
      // Render the main block
      return this.evaluateProgram(node.program);
    }
  }

  /**
   * Evaluates the #unless block helper.
   *
   * Inverse of #if: renders the main block if the condition is falsy,
   * otherwise renders the inverse block.
   *
   * @param node - The BlockStatement node for #unless
   * @returns The rendered output based on the inverted condition
   */
  private evaluateUnlessHelper(node: BlockStatement): string {
    // #unless requires exactly 1 parameter (the condition)
    if (node.params.length !== 1) {
      throw new Error(`#unless helper requires exactly 1 parameter, got ${node.params.length}`);
    }

    // Evaluate the condition
    const condition = this.evaluateExpression(node.params[0]);

    // #unless is inverse of #if: match same logic (!conditional) || isEmpty(conditional)
    const isFalsy = !condition || isEmpty(condition);

    if (isFalsy) {
      // Render the main block
      return this.evaluateProgram(node.program);
    } else {
      // Render the inverse block ({{else}}) if present
      return this.evaluateProgram(node.inverse);
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

    // Evaluate the collection parameter
    const collection = this.evaluateExpression(node.params[0]);

    // Handle arrays
    if (Array.isArray(collection)) {
      return this.evaluateEachArray(node, collection);
    }

    // Handle objects
    if (collection !== null && typeof collection === 'object') {
      return this.evaluateEachObject(node, collection);
    }

    // For null, undefined, or other non-iterables, render inverse block
    return this.evaluateProgram(node.inverse);
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
      return this.evaluateProgram(node.inverse);
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

      const item = collection[i];

      // Create data frame with loop variables
      // Keys must be prefixed with @ for data variable access
      const parentFrame = this.dataStack.getCurrent();
      const frame = createDataFrame(parentFrame, {
        '@index': i,
        '@first': i === firstIndex,
        '@last': i === lastIndex,
      });
      this.dataStack.push(frame);

      // Push array item as new context
      this.contextStack.push(item);

      // Evaluate the program block with the current item
      output += this.evaluateProgram(node.program);

      // Pop context and data stacks
      this.contextStack.pop();
      this.dataStack.pop();
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
    // Get object keys using Object.keys() for consistent iteration order
    const keys = Object.keys(collection);

    // Empty objects render the inverse block ({{else}})
    if (keys.length === 0) {
      return this.evaluateProgram(node.inverse);
    }

    let output = '';

    // Iterate over keys with index
    keys.forEach((key, index) => {
      // Create data frame with loop variables
      // Keys must be prefixed with @ for data variable access
      const parentFrame = this.dataStack.getCurrent();
      const frame = createDataFrame(parentFrame, {
        '@key': key,
        '@index': index,
        '@first': index === 0,
        '@last': index === keys.length - 1,
      });
      this.dataStack.push(frame);

      // Push property value as new context
      this.contextStack.push((collection as any)[key]);

      // Evaluate the program block with the current property value
      output += this.evaluateProgram(node.program);

      // Pop context and data stacks
      this.contextStack.pop();
      this.dataStack.pop();
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

    // Evaluate the parameter to get the value
    const value = this.evaluateExpression(node.params[0]);

    // Match #if logic: (!value) || isEmpty(value) for falsy check
    const isFalsy = !value || isEmpty(value);

    if (isFalsy) {
      return this.evaluateProgram(node.inverse);
    }

    // Push value as new context and data frame (inherits @root but no new loop variables)
    this.contextStack.push(value);
    const parentFrame = this.dataStack.getCurrent();
    const frame = createDataFrame(parentFrame, {});
    this.dataStack.push(frame);

    // Evaluate the program block with the new context
    const output = this.evaluateProgram(node.program);

    // Pop context and data stacks
    this.dataStack.pop();
    this.contextStack.pop();

    return output;
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
    return this.helpers[name];
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

    // Check if helper exists in registry
    const helperName = node.path.parts[0];
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
      throw new Error(`Unknown helper: ${helperName}`);
    }

    // Evaluate all parameters recursively
    const args = expr.params.map((param) => this.evaluateExpression(param));

    // Call helper with current context as 'this' binding
    const context = this.contextStack.getCurrent();
    return helper.call(context, ...args);
  }

  /**
   * Evaluates a PathExpression using the context and data stacks.
   *
   * @param expr - The PathExpression to evaluate
   * @returns The resolved value from context or data
   */
  private evaluatePathExpression(expr: PathExpression): any {
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
}
