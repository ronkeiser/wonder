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
   * Evaluates the #each block helper (stub).
   *
   * TODO: Implement in Feature 5.3
   *
   * @param _node - The BlockStatement node for #each
   * @returns Empty string (stub)
   */
  private evaluateEachHelper(_node: BlockStatement): string {
    throw new Error('#each helper not yet implemented');
  }

  /**
   * Evaluates the #with block helper (stub).
   *
   * TODO: Implement in Feature 5.5
   *
   * @param _node - The BlockStatement node for #with
   * @returns Empty string (stub)
   */
  private evaluateWithHelper(_node: BlockStatement): string {
    throw new Error('#with helper not yet implemented');
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
