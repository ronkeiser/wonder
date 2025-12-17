import type {
  ArrayExpression,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  Literal,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
  Property,
  UnaryExpression,
} from '../parser/ast';
import { isPlainObject, lookupProperty } from '../runtime/utils';

/**
 * Function registry type
 */
export type FunctionRegistry = Record<string, (...args: unknown[]) => unknown>;

/**
 * Interpreter for expression AST
 *
 * Evaluates AST nodes against a context object, returning JSON-compatible values.
 * All operations are pure and return new values.
 */
export class Interpreter {
  private functions: FunctionRegistry;

  constructor(functions: FunctionRegistry = {}) {
    this.functions = functions;
  }

  /**
   * Evaluate an expression against a context
   */
  evaluate(node: Expression, context: Record<string, unknown>): unknown {
    switch (node.type) {
      case 'Literal':
        return this.evaluateLiteral(node);
      case 'Identifier':
        return this.evaluateIdentifier(node, context);
      case 'MemberExpression':
        return this.evaluateMemberExpression(node, context);
      case 'ArrayExpression':
        return this.evaluateArrayExpression(node, context);
      case 'ObjectExpression':
        return this.evaluateObjectExpression(node, context);
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node, context);
      case 'LogicalExpression':
        return this.evaluateLogicalExpression(node, context);
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node, context);
      case 'ConditionalExpression':
        return this.evaluateConditionalExpression(node, context);
      case 'CallExpression':
        return this.evaluateCallExpression(node, context);
      default:
        throw new Error(`Unknown node type: ${(node as Expression).type}`);
    }
  }

  private evaluateLiteral(node: Literal): unknown {
    return node.value;
  }

  private evaluateIdentifier(node: Identifier, context: Record<string, unknown>): unknown {
    return lookupProperty(context, node.name);
  }

  private evaluateMemberExpression(node: MemberExpression, context: Record<string, unknown>): unknown {
    const object = this.evaluate(node.object, context);

    if (object == null) {
      return undefined;
    }

    if (node.computed) {
      // Bracket notation: obj[expr]
      const property = this.evaluate(node.property, context);
      if (typeof property === 'number' && Array.isArray(object)) {
        return object[property];
      }
      if (typeof property === 'string') {
        return lookupProperty(object, property);
      }
      return undefined;
    } else {
      // Dot notation: obj.prop
      const property = node.property as Identifier;
      return lookupProperty(object, property.name);
    }
  }

  private evaluateArrayExpression(node: ArrayExpression, context: Record<string, unknown>): unknown[] {
    const result: unknown[] = [];

    for (const element of node.elements) {
      if (element.type === 'SpreadElement') {
        const spread = this.evaluate(element.argument, context);
        if (Array.isArray(spread)) {
          result.push(...spread);
        } else {
          throw new Error('Spread argument must be an array');
        }
      } else {
        result.push(this.evaluate(element, context));
      }
    }

    return result;
  }

  private evaluateObjectExpression(
    node: ObjectExpression,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const prop of node.properties) {
      if (prop.type === 'SpreadElement') {
        const spread = this.evaluate(prop.argument, context);
        if (isPlainObject(spread)) {
          Object.assign(result, spread);
        } else {
          throw new Error('Spread argument must be an object');
        }
      } else {
        const property = prop as Property;
        let key: string;

        if (property.key.type === 'Identifier') {
          key = property.key.name;
        } else {
          // Literal key
          key = String((property.key as Literal).value);
        }

        result[key] = this.evaluate(property.value, context);
      }
    }

    return result;
  }

  private evaluateBinaryExpression(node: BinaryExpression, context: Record<string, unknown>): unknown {
    const left = this.evaluate(node.left, context);
    const right = this.evaluate(node.right, context);

    switch (node.operator) {
      // Arithmetic (with string concatenation for +)
      case '+':
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        return (left as number) / (right as number);
      case '%':
        return (left as number) % (right as number);

      // Equality
      case '===':
        return left === right;
      case '!==':
        return left !== right;

      // Comparison
      case '>':
        return (left as number) > (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '<':
        return (left as number) < (right as number);
      case '<=':
        return (left as number) <= (right as number);

      default:
        throw new Error(`Unknown binary operator: ${node.operator}`);
    }
  }

  private evaluateLogicalExpression(node: LogicalExpression, context: Record<string, unknown>): unknown {
    const left = this.evaluate(node.left, context);

    // Short-circuit evaluation
    if (node.operator === '&&') {
      // Return left if falsy, otherwise evaluate and return right
      if (!left) return left;
      return this.evaluate(node.right, context);
    } else {
      // ||: Return left if truthy, otherwise evaluate and return right
      if (left) return left;
      return this.evaluate(node.right, context);
    }
  }

  private evaluateUnaryExpression(node: UnaryExpression, context: Record<string, unknown>): unknown {
    const argument = this.evaluate(node.argument, context);

    switch (node.operator) {
      case '!':
        return !argument;
      case '-':
        return -(argument as number);
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }

  private evaluateConditionalExpression(node: ConditionalExpression, context: Record<string, unknown>): unknown {
    const test = this.evaluate(node.test, context);

    // Only evaluate the taken branch
    if (test) {
      return this.evaluate(node.consequent, context);
    } else {
      return this.evaluate(node.alternate, context);
    }
  }

  private evaluateCallExpression(node: CallExpression, context: Record<string, unknown>): unknown {
    const funcName = node.callee.name;
    const func = this.functions[funcName];

    if (!func) {
      throw new Error(`Unknown function: ${funcName}`);
    }

    const args = node.arguments.map((arg) => this.evaluate(arg, context));
    return func(...args);
  }
}
