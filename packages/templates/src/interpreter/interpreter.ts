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
   * Stub implementation - will be completed in Task C4-F4-T3.
   *
   * @param _node - The MustacheStatement node
   * @returns Empty string (stub)
   */
  private evaluateMustache(_node: MustacheStatement): string {
    // TODO: Implement in Task C4-F4-T3
    throw new Error('MustacheStatement evaluation not yet implemented');
  }

  /**
   * Evaluates a BlockStatement (block helper).
   *
   * Stub implementation - will be completed in Capability 6.
   *
   * @param _node - The BlockStatement node
   * @returns Empty string (stub)
   */
  private evaluateBlock(_node: BlockStatement): string {
    // TODO: Implement in Capability 6 (Block Helpers)
    throw new Error('BlockStatement evaluation not yet implemented');
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
