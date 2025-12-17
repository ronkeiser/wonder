import { describe, expect, it } from 'vitest';
import { Lexer, LexerError, TokenType } from '../src/lexer';

describe('Lexer', () => {
  const lexer = new Lexer();

  function tokenTypes(input: string): string[] {
    return lexer.tokenize(input).map((t) => t.type);
  }

  function tokenValues(input: string): string[] {
    return lexer.tokenize(input).map((t) => t.value);
  }

  describe('literals', () => {
    describe('strings', () => {
      it('tokenizes single-quoted strings', () => {
        const tokens = lexer.tokenize("'hello'");
        expect(tokens[0].type).toBe(TokenType.STRING);
        expect(tokens[0].value).toBe('hello');
      });

      it('tokenizes double-quoted strings', () => {
        const tokens = lexer.tokenize('"world"');
        expect(tokens[0].type).toBe(TokenType.STRING);
        expect(tokens[0].value).toBe('world');
      });

      it('tokenizes empty strings', () => {
        expect(lexer.tokenize("''")[0].value).toBe('');
        expect(lexer.tokenize('""')[0].value).toBe('');
      });

      it('handles escape sequences', () => {
        expect(lexer.tokenize("'hello\\nworld'")[0].value).toBe('hello\nworld');
        expect(lexer.tokenize("'tab\\there'")[0].value).toBe('tab\there');
        expect(lexer.tokenize("'back\\\\slash'")[0].value).toBe('back\\slash');
        expect(lexer.tokenize("'quote\\'s'")[0].value).toBe("quote's");
        expect(lexer.tokenize('"quote\\"s"')[0].value).toBe('quote"s');
      });

      it('handles carriage return escape', () => {
        expect(lexer.tokenize("'line\\rbreak'")[0].value).toBe('line\rbreak');
      });

      it('handles unknown escape sequences (passthrough)', () => {
        expect(lexer.tokenize("'hello\\xworld'")[0].value).toBe('helloxworld');
      });

      it('throws on unterminated strings', () => {
        expect(() => lexer.tokenize("'unterminated")).toThrow(LexerError);
        expect(() => lexer.tokenize('"unterminated')).toThrow(LexerError);
      });

      it('throws on newlines in strings', () => {
        expect(() => lexer.tokenize("'line1\nline2'")).toThrow(LexerError);
      });
    });

    describe('numbers', () => {
      it('tokenizes integers', () => {
        const tokens = lexer.tokenize('42');
        expect(tokens[0].type).toBe(TokenType.NUMBER);
        expect(tokens[0].value).toBe('42');
      });

      it('tokenizes decimals', () => {
        const tokens = lexer.tokenize('3.14');
        expect(tokens[0].type).toBe(TokenType.NUMBER);
        expect(tokens[0].value).toBe('3.14');
      });

      it('tokenizes zero', () => {
        expect(lexer.tokenize('0')[0].value).toBe('0');
        expect(lexer.tokenize('0.5')[0].value).toBe('0.5');
      });

      it('tokenizes multiple digits', () => {
        expect(lexer.tokenize('12345')[0].value).toBe('12345');
        expect(lexer.tokenize('123.456')[0].value).toBe('123.456');
      });
    });

    describe('booleans', () => {
      it('tokenizes true', () => {
        const tokens = lexer.tokenize('true');
        expect(tokens[0].type).toBe(TokenType.BOOLEAN);
        expect(tokens[0].value).toBe('true');
      });

      it('tokenizes false', () => {
        const tokens = lexer.tokenize('false');
        expect(tokens[0].type).toBe(TokenType.BOOLEAN);
        expect(tokens[0].value).toBe('false');
      });
    });

    describe('null', () => {
      it('tokenizes null', () => {
        const tokens = lexer.tokenize('null');
        expect(tokens[0].type).toBe(TokenType.NULL);
        expect(tokens[0].value).toBe('null');
      });
    });
  });

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = lexer.tokenize('foo');
      expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe('foo');
    });

    it('tokenizes identifiers with underscores', () => {
      expect(lexer.tokenize('foo_bar')[0].value).toBe('foo_bar');
      expect(lexer.tokenize('_private')[0].value).toBe('_private');
    });

    it('tokenizes identifiers with dollar signs', () => {
      expect(lexer.tokenize('$value')[0].value).toBe('$value');
      expect(lexer.tokenize('foo$bar')[0].value).toBe('foo$bar');
    });

    it('tokenizes identifiers with numbers', () => {
      expect(lexer.tokenize('item1')[0].value).toBe('item1');
      expect(lexer.tokenize('a2b3c4')[0].value).toBe('a2b3c4');
    });

    it('does not confuse identifiers with keywords', () => {
      expect(lexer.tokenize('trueValue')[0].type).toBe(TokenType.IDENTIFIER);
      expect(lexer.tokenize('falsehood')[0].type).toBe(TokenType.IDENTIFIER);
      expect(lexer.tokenize('nullable')[0].type).toBe(TokenType.IDENTIFIER);
    });
  });

  describe('arithmetic operators', () => {
    it('tokenizes +', () => {
      expect(tokenTypes('a + b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.PLUS,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes -', () => {
      expect(tokenTypes('a - b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.MINUS,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes *', () => {
      expect(tokenTypes('a * b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.STAR,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes /', () => {
      expect(tokenTypes('a / b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.SLASH,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes %', () => {
      expect(tokenTypes('a % b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.PERCENT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });
  });

  describe('comparison operators', () => {
    it('tokenizes ===', () => {
      expect(tokenTypes('a === b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.EQ,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes !==', () => {
      expect(tokenTypes('a !== b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.NEQ,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes >', () => {
      expect(tokenTypes('a > b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.GT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes >=', () => {
      expect(tokenTypes('a >= b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.GTE,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes <', () => {
      expect(tokenTypes('a < b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.LT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes <=', () => {
      expect(tokenTypes('a <= b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.LTE,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('throws on single = (assignment)', () => {
      expect(() => lexer.tokenize('a = b')).toThrow(LexerError);
    });
  });

  describe('logical operators', () => {
    it('tokenizes &&', () => {
      expect(tokenTypes('a && b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.AND,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes ||', () => {
      expect(tokenTypes('a || b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.OR,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes !', () => {
      expect(tokenTypes('!a')).toEqual([TokenType.NOT, TokenType.IDENTIFIER, TokenType.EOF]);
    });

    it('throws on single & (bitwise)', () => {
      expect(() => lexer.tokenize('a & b')).toThrow(LexerError);
    });

    it('throws on single | (bitwise)', () => {
      expect(() => lexer.tokenize('a | b')).toThrow(LexerError);
    });
  });

  describe('punctuation', () => {
    it('tokenizes parentheses', () => {
      expect(tokenTypes('(a)')).toEqual([
        TokenType.LPAREN,
        TokenType.IDENTIFIER,
        TokenType.RPAREN,
        TokenType.EOF,
      ]);
    });

    it('tokenizes brackets', () => {
      expect(tokenTypes('[a]')).toEqual([
        TokenType.LBRACKET,
        TokenType.IDENTIFIER,
        TokenType.RBRACKET,
        TokenType.EOF,
      ]);
    });

    it('tokenizes braces', () => {
      expect(tokenTypes('{a}')).toEqual([
        TokenType.LBRACE,
        TokenType.IDENTIFIER,
        TokenType.RBRACE,
        TokenType.EOF,
      ]);
    });

    it('tokenizes comma', () => {
      expect(tokenTypes('a, b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes colon', () => {
      expect(tokenTypes('a: b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes dot', () => {
      expect(tokenTypes('a.b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes question mark', () => {
      expect(tokenTypes('a ? b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.QUESTION,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });
  });

  describe('spread operator', () => {
    it('tokenizes ...', () => {
      expect(tokenTypes('...arr')).toEqual([TokenType.SPREAD, TokenType.IDENTIFIER, TokenType.EOF]);
    });

    it('distinguishes spread from dot', () => {
      expect(tokenTypes('a.b')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
      expect(tokenTypes('...b')).toEqual([TokenType.SPREAD, TokenType.IDENTIFIER, TokenType.EOF]);
    });
  });

  describe('whitespace handling', () => {
    it('ignores spaces', () => {
      expect(tokenValues('a   +   b')).toEqual(['a', '+', 'b', '']);
    });

    it('ignores tabs', () => {
      expect(tokenValues('a\t+\tb')).toEqual(['a', '+', 'b', '']);
    });

    it('ignores newlines', () => {
      expect(tokenValues('a\n+\nb')).toEqual(['a', '+', 'b', '']);
    });

    it('handles mixed whitespace', () => {
      expect(tokenValues('a \t\n + \t\n b')).toEqual(['a', '+', 'b', '']);
    });
  });

  describe('complex expressions', () => {
    it('tokenizes array literal', () => {
      expect(tokenTypes('[1, 2, 3]')).toEqual([
        TokenType.LBRACKET,
        TokenType.NUMBER,
        TokenType.COMMA,
        TokenType.NUMBER,
        TokenType.COMMA,
        TokenType.NUMBER,
        TokenType.RBRACKET,
        TokenType.EOF,
      ]);
    });

    it('tokenizes object literal', () => {
      expect(tokenTypes("{ key: 'value' }")).toEqual([
        TokenType.LBRACE,
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.STRING,
        TokenType.RBRACE,
        TokenType.EOF,
      ]);
    });

    it('tokenizes function call', () => {
      expect(tokenTypes('sum(a, b)')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.LPAREN,
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.IDENTIFIER,
        TokenType.RPAREN,
        TokenType.EOF,
      ]);
    });

    it('tokenizes ternary expression', () => {
      expect(tokenTypes('a ? b : c')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.QUESTION,
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes member access chain', () => {
      expect(tokenTypes('a.b.c')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
        TokenType.EOF,
      ]);
    });

    it('tokenizes computed member access', () => {
      expect(tokenTypes('a[0]')).toEqual([
        TokenType.IDENTIFIER,
        TokenType.LBRACKET,
        TokenType.NUMBER,
        TokenType.RBRACKET,
        TokenType.EOF,
      ]);
    });

    it('tokenizes spread in array', () => {
      expect(tokenTypes('[...arr, item]')).toEqual([
        TokenType.LBRACKET,
        TokenType.SPREAD,
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.IDENTIFIER,
        TokenType.RBRACKET,
        TokenType.EOF,
      ]);
    });

    it('tokenizes spread in object', () => {
      expect(tokenTypes('{ ...obj, key: value }')).toEqual([
        TokenType.LBRACE,
        TokenType.SPREAD,
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.IDENTIFIER,
        TokenType.COLON,
        TokenType.IDENTIFIER,
        TokenType.RBRACE,
        TokenType.EOF,
      ]);
    });
  });

  describe('position tracking', () => {
    it('tracks line and column for single line', () => {
      const tokens = lexer.tokenize('a + b');
      expect(tokens[0].loc.start).toEqual({ line: 1, column: 0, offset: 0 });
      expect(tokens[1].loc.start).toEqual({ line: 1, column: 2, offset: 2 });
      expect(tokens[2].loc.start).toEqual({ line: 1, column: 4, offset: 4 });
    });

    it('tracks line and column across newlines', () => {
      const tokens = lexer.tokenize('a\n+\nb');
      expect(tokens[0].loc.start).toEqual({ line: 1, column: 0, offset: 0 });
      expect(tokens[1].loc.start).toEqual({ line: 2, column: 0, offset: 2 });
      expect(tokens[2].loc.start).toEqual({ line: 3, column: 0, offset: 4 });
    });

    it('includes position in error messages', () => {
      try {
        lexer.tokenize('a = b');
      } catch (e) {
        expect(e).toBeInstanceOf(LexerError);
        expect((e as LexerError).message).toContain('line 1');
        expect((e as LexerError).message).toContain('column 3');
        // Position is after consuming '=' (offset 2 + 1 = 3)
        expect((e as LexerError).position).toEqual({ line: 1, column: 3, offset: 3 });
      }
    });
  });

  describe('error cases', () => {
    it('throws on unexpected character', () => {
      expect(() => lexer.tokenize('@foo')).toThrow(LexerError);
      expect(() => lexer.tokenize('a # b')).toThrow(LexerError);
      expect(() => lexer.tokenize('a ~ b')).toThrow(LexerError);
    });

    it('throws on backtick (template literal)', () => {
      expect(() => lexer.tokenize('`template`')).toThrow(LexerError);
    });

    it('throws on caret', () => {
      expect(() => lexer.tokenize('a ^ b')).toThrow(LexerError);
    });

    it('includes expression in error', () => {
      try {
        lexer.tokenize('bad @ input');
      } catch (e) {
        expect((e as LexerError).expression).toBe('bad @ input');
      }
    });
  });
});
