/**
 * Template Interpreter
 *
 * Tree-walking interpreter that evaluates AST nodes using context and data stacks.
 * Implements Handlebars-compatible template evaluation without code generation.
 */

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
  UndefinedLiteral,
} from '../parser/ast-nodes.js';
import { escapeExpression, isEmpty } from '../runtime/utils.js';
import { ContextStack } from './context-stack.js';
import { createDataFrame } from './data-frame.js';
import { DataStack } from './data-stack.js';
import { resolvePathExpression } from './path-resolver.js';

/**
 * Options for configuring the interpreter.
 * Reserved for future capabilities (helpers, partials, etc.)
 */
export interface InterpreterOptions {
  // Reserved for Capability 6: Built-in helpers
  helpers?: Record<string, Function>;
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
  // @ts-expect-error - Reserved for future use (Capability 6: helpers, Capability 7: partials)
  private _options: InterpreterOptions;
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
    this._options = options;
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
   * Evaluates a MustacheStatement (variable output).
   *
   * Resolves the path, converts to string, and applies HTML escaping if needed.
   *
   * @param node - The MustacheStatement node
   * @returns The output string (escaped or unescaped)
   */
  private evaluateMustache(node: MustacheStatement): string {
    // V1: No helper calls - params must be empty
    if (node.params.length > 0) {
      throw new Error(
        'Helper calls not yet implemented (Capability 6). Use simple variables only.',
      );
    }

    // Resolve the path to get the value
    const value = this.evaluatePathExpression(node.path);

    // Handle null/undefined - return empty string
    if (value == null) {
      return '';
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
        throw new Error(`Unknown block helper: ${helperName}`);
    }
  }

  /**
   * Evaluates the #if block helper.
   *
   * Renders the main block if the condition is truthy (using Handlebars isEmpty),
   * otherwise renders the inverse block ({{else}}) if present.
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

    // Use Handlebars truthiness: isEmpty() returns true for falsy values
    const isTruthy = !isEmpty(condition);

    if (isTruthy) {
      // Render the main block
      return this.evaluateProgram(node.program);
    } else {
      // Render the inverse block ({{else}}) if present
      return this.evaluateProgram(node.inverse);
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

    // Invert the condition: render main block if falsy
    const isFalsy = isEmpty(condition);

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
      this.dataStack.push({
        '@index': i,
        '@first': i === firstIndex,
        '@last': i === lastIndex,
      });

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
      this.dataStack.push({
        '@key': key,
        '@index': index,
        '@first': index === 0,
        '@last': index === keys.length - 1,
      });

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

    // If value is empty/falsy (using Handlebars truthiness), render else block
    if (isEmpty(value)) {
      return this.evaluateProgram(node.inverse);
    }

    // Push value as new context and empty data frame (no loop variables)
    this.contextStack.push(value);
    this.dataStack.push({});

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
        // TODO: Implement in Capability 6 (SubExpressions for helper calls)
        throw new Error('SubExpression evaluation not yet implemented');
      default:
        throw new Error(`Unknown expression type: ${(expr as any).type}`);
    }
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
