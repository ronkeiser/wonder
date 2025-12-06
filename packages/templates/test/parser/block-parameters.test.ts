import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import type {
  BlockStatement,
  BooleanLiteral,
  NullLiteral,
  NumberLiteral,
  PathExpression,
  StringLiteral,
  UndefinedLiteral,
} from '../../src/parser/ast-nodes';
import { Parser } from '../../src/parser/parser';

describe('Parser - Block Parameters', () => {
  const createParser = (template: string): Parser => {
    const lexer = new Lexer();
    const parser = new Parser(lexer);
    parser.setInput(template);
    return parser;
  };

  describe('Literal Parameters', () => {
    describe('String Literals', () => {
      it('should parse single string parameter', () => {
        const template = '{{#if "test"}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        expect(block.params).toHaveLength(1);

        const param = block.params[0] as StringLiteral;
        expect(param.type).toBe('StringLiteral');
        expect(param.value).toBe('test');
      });

      it('should parse string with single quotes', () => {
        const template = "{{#if 'test'}}content{{/if}}";
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as StringLiteral;
        expect(param.value).toBe('test');
      });

      it('should parse string with spaces', () => {
        const template = '{{#if "hello world"}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as StringLiteral;
        expect(param.value).toBe('hello world');
      });

      it('should parse empty string', () => {
        const template = '{{#if ""}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as StringLiteral;
        expect(param.value).toBe('');
      });
    });

    describe('Number Literals', () => {
      it('should parse positive integer', () => {
        const template = '{{#if 42}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as NumberLiteral;
        expect(param.type).toBe('NumberLiteral');
        expect(param.value).toBe(42);
      });

      it('should parse negative integer', () => {
        const template = '{{#if -10}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as NumberLiteral;
        expect(param.value).toBe(-10);
      });

      it('should parse decimal number', () => {
        const template = '{{#if 3.14}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as NumberLiteral;
        expect(param.value).toBe(3.14);
      });

      it('should parse zero', () => {
        const template = '{{#if 0}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as NumberLiteral;
        expect(param.value).toBe(0);
      });
    });

    describe('Boolean Literals', () => {
      it('should parse true', () => {
        const template = '{{#if true}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as BooleanLiteral;
        expect(param.type).toBe('BooleanLiteral');
        expect(param.value).toBe(true);
      });

      it('should parse false', () => {
        const template = '{{#if false}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as BooleanLiteral;
        expect(param.value).toBe(false);
      });
    });

    describe('Null and Undefined Literals', () => {
      it('should parse null', () => {
        const template = '{{#if null}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as NullLiteral;
        expect(param.type).toBe('NullLiteral');
        expect(param.value).toBe(null);
      });

      it('should parse undefined', () => {
        const template = '{{#if undefined}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as UndefinedLiteral;
        expect(param.type).toBe('UndefinedLiteral');
        expect(param.value).toBeUndefined();
      });
    });
  });

  describe('Path Parameters', () => {
    describe('Simple Paths', () => {
      it('should parse simple identifier parameter', () => {
        const template = '{{#if condition}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        expect(block.params).toHaveLength(1);

        const param = block.params[0] as PathExpression;
        expect(param.type).toBe('PathExpression');
        expect(param.original).toBe('condition');
        expect(param.parts).toEqual(['condition']);
      });

      it('should parse nested path parameter', () => {
        const template = '{{#if user.isActive}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.original).toBe('user.isActive');
        expect(param.parts).toEqual(['user', 'isActive']);
      });

      it('should parse deeply nested path', () => {
        const template = '{{#if user.profile.settings.notifications}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.parts).toEqual(['user', 'profile', 'settings', 'notifications']);
      });

      it('should parse this keyword', () => {
        const template = '{{#if this}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.original).toBe('this');
      });

      it('should parse this with property', () => {
        const template = '{{#if this.value}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.original).toBe('this.value');
      });
    });

    describe('Data Variable Paths', () => {
      it('should parse data variable parameter', () => {
        const template = '{{#if @index}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.type).toBe('PathExpression');
        expect(param.data).toBe(true);
        expect(param.original).toBe('@index');
      });

      it('should parse data variable with nested path', () => {
        const template = '{{#if @root.settings.debug}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.data).toBe(true);
        expect(param.original).toBe('@root.settings.debug');
      });
    });

    describe('Parent Paths', () => {
      it('should parse single parent path', () => {
        const template = '{{#if ../value}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.original).toBe('../value');
        expect(param.depth).toBe(1);
      });

      it('should parse multiple parent levels', () => {
        const template = '{{#if ../../value}}content{{/if}}';
        const parser = createParser(template);
        const ast = parser.parseProgram();

        const block = ast.body[0] as BlockStatement;
        const param = block.params[0] as PathExpression;
        expect(param.original).toBe('../../value');
        expect(param.depth).toBe(2);
      });
    });
  });

  describe('Multiple Parameters', () => {
    it('should parse two parameters', () => {
      const template = '{{#compare a b}}content{{/compare}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(2);

      const param1 = block.params[0] as PathExpression;
      const param2 = block.params[1] as PathExpression;
      expect(param1.original).toBe('a');
      expect(param2.original).toBe('b');
    });

    it('should parse three parameters', () => {
      const template = '{{#helper arg1 arg2 arg3}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(3);
      expect((block.params[0] as PathExpression).original).toBe('arg1');
      expect((block.params[1] as PathExpression).original).toBe('arg2');
      expect((block.params[2] as PathExpression).original).toBe('arg3');
    });

    it('should parse mixed parameter types', () => {
      const template = '{{#helper "string" 42 condition}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(3);

      expect(block.params[0].type).toBe('StringLiteral');
      expect((block.params[0] as StringLiteral).value).toBe('string');

      expect(block.params[1].type).toBe('NumberLiteral');
      expect((block.params[1] as NumberLiteral).value).toBe(42);

      expect(block.params[2].type).toBe('PathExpression');
      expect((block.params[2] as PathExpression).original).toBe('condition');
    });

    it('should parse boolean and path parameters', () => {
      const template = '{{#helper true value false}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(3);
      expect((block.params[0] as BooleanLiteral).value).toBe(true);
      expect((block.params[1] as PathExpression).original).toBe('value');
      expect((block.params[2] as BooleanLiteral).value).toBe(false);
    });
  });

  describe('Different Block Helper Types', () => {
    it('should parse parameters for if block', () => {
      const template = '{{#if condition}}content{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('if');
      expect(block.params).toHaveLength(1);
    });

    it('should parse parameters for each block', () => {
      const template = '{{#each items}}content{{/each}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('each');
      expect(block.params).toHaveLength(1);
    });

    it('should parse parameters for with block', () => {
      const template = '{{#with user}}content{{/with}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('with');
      expect(block.params).toHaveLength(1);
    });

    it('should parse parameters for unless block', () => {
      const template = '{{#unless disabled}}content{{/unless}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('unless');
      expect(block.params).toHaveLength(1);
    });

    it('should parse parameters for custom helper', () => {
      const template = '{{#customHelper arg1 arg2}}content{{/customHelper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('customHelper');
      expect(block.params).toHaveLength(2);
    });
  });

  describe('No Parameters', () => {
    it('should handle block with no parameters', () => {
      const template = '{{#helper}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(0);
    });

    it('should handle block with only whitespace', () => {
      const template = '{{#helper   }}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(0);
    });
  });

  describe('Location Tracking', () => {
    it('should track location for string parameter', () => {
      const template = '{{#if "test"}}content{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      const param = block.params[0];
      expect(param.loc).toBeTruthy();
      expect(param.loc!.start.line).toBe(1);
    });

    it('should track location for path parameter', () => {
      const template = '{{#if condition}}content{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      const param = block.params[0];
      expect(param.loc).toBeTruthy();
    });

    it('should track different locations for multiple parameters', () => {
      const template = '{{#helper arg1 arg2}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params[0].loc).toBeTruthy();
      expect(block.params[1].loc).toBeTruthy();

      // Second parameter should start after first
      expect(block.params[1].loc!.start.column).toBeGreaterThan(block.params[0].loc!.start.column);
    });
  });

  describe('Parameters with Else Blocks', () => {
    it('should parse parameters in block with else', () => {
      const template = '{{#if condition}}yes{{else}}no{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(1);
      expect((block.params[0] as PathExpression).original).toBe('condition');
      expect(block.inverse).toBeTruthy();
    });

    it('should parse multiple parameters in block with else', () => {
      const template = '{{#compare a b}}yes{{else}}no{{/compare}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(2);
      expect(block.inverse).toBeTruthy();
    });
  });

  describe('Nested Blocks with Parameters', () => {
    it('should parse parameters in nested blocks', () => {
      const template = '{{#if outer}}{{#if inner}}content{{/if}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      expect(outerBlock.params).toHaveLength(1);
      expect((outerBlock.params[0] as PathExpression).original).toBe('outer');

      const innerBlock = outerBlock.program!.body[0] as BlockStatement;
      expect(innerBlock.params).toHaveLength(1);
      expect((innerBlock.params[0] as PathExpression).original).toBe('inner');
    });

    it('should handle different parameter types in nested blocks', () => {
      const template = '{{#if condition}}{{#each items}}{{/each}}{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const outerBlock = ast.body[0] as BlockStatement;
      const innerBlock = outerBlock.program!.body[0] as BlockStatement;

      expect((outerBlock.params[0] as PathExpression).original).toBe('condition');
      expect((innerBlock.params[0] as PathExpression).original).toBe('items');
    });
  });

  describe('Real-world Examples', () => {
    it('should parse typical if condition', () => {
      const template = '{{#if user.isLoggedIn}}Welcome{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('if');
      expect(block.params).toHaveLength(1);
      expect((block.params[0] as PathExpression).original).toBe('user.isLoggedIn');
    });

    it('should parse each with collection', () => {
      const template = '{{#each products}}{{name}}{{/each}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('each');
      expect((block.params[0] as PathExpression).original).toBe('products');
    });

    it('should parse with context change', () => {
      const template = '{{#with user.profile}}{{name}}{{/with}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('with');
      expect((block.params[0] as PathExpression).original).toBe('user.profile');
    });

    it('should parse unless with negation', () => {
      const template = '{{#unless user.isAdmin}}Limited Access{{/unless}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.path.original).toBe('unless');
      expect((block.params[0] as PathExpression).original).toBe('user.isAdmin');
    });
  });

  describe('Edge Cases', () => {
    it('should handle parameter that looks like keyword', () => {
      const template = '{{#if null}}content{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      const param = block.params[0] as NullLiteral;
      expect(param.type).toBe('NullLiteral');
    });

    it('should handle numeric string that looks like number', () => {
      const template = '{{#if "123"}}content{{/if}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      const param = block.params[0] as StringLiteral;
      expect(param.type).toBe('StringLiteral');
      expect(param.value).toBe('123');
    });

    it('should handle multiple spaces between parameters', () => {
      const template = '{{#helper arg1    arg2}}content{{/helper}}';
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(2);
    });

    it('should handle newline before parameter', () => {
      const template = `{{#if
        condition}}content{{/if}}`;
      const parser = createParser(template);
      const ast = parser.parseProgram();

      const block = ast.body[0] as BlockStatement;
      expect(block.params).toHaveLength(1);
      expect((block.params[0] as PathExpression).original).toBe('condition');
    });
  });
});
