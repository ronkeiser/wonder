import { describe, expect, it } from 'vitest';
import { Lexer } from '../../src/lexer/lexer';
import { TokenType } from '../../src/lexer/token-types';

/**
 * Helper to tokenize a template and return array of {name, text} objects
 * matching the Handlebars test pattern
 */
function tokenize(template: string): Array<{ name: string; text: string }> {
  const lexer = new Lexer();
  lexer.setInput(template);

  const tokens: Array<{ name: string; text: string }> = [];

  while (true) {
    const token = lexer.lex();
    if (!token || token.type === TokenType.EOF) {
      break;
    }

    tokens.push({
      name: token.type,
      text: token.value,
    });
  }

  return tokens;
}

/**
 * Helper to assert token sequence matches expected types
 */
function shouldMatchTokens(
  result: Array<{ name: string; text: string }>,
  expected: string[],
): void {
  expect(result).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(result[i].name).toBe(expected[i]);
  }
}

/**
 * Helper to assert individual token properties
 */
function shouldBeToken(token: { name: string; text: string }, name: string, text: string): void {
  expect(token.name).toBe(name);
  expect(token.text).toBe(text);
}

describe('Tokenizer', () => {
  // Basic mustache tokenization
  it('tokenizes a simple mustache as "OPEN ID CLOSE"', () => {
    const result = tokenize('{{foo}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
  });

  it('supports unescaping with &', () => {
    const result = tokenize('{{&bar}}');
    shouldMatchTokens(result, ['OPEN_RAW', 'ID', 'CLOSE']);
    shouldBeToken(result[0], 'OPEN_RAW', '{{&');
    shouldBeToken(result[1], 'ID', 'bar');
  });

  it('supports unescaping with {{{', () => {
    const result = tokenize('{{{bar}}}');
    shouldMatchTokens(result, ['OPEN_UNESCAPED', 'ID', 'CLOSE_UNESCAPED']);
    shouldBeToken(result[1], 'ID', 'bar');
  });

  // Escape sequences
  it('supports escaping delimiters', () => {
    const result = tokenize('{{foo}} \\{{bar}} {{baz}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE', 'CONTENT', 'CONTENT', 'OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[3], 'CONTENT', ' ');
    shouldBeToken(result[4], 'CONTENT', '{{bar}} ');
  });

  it('supports escaping multiple delimiters', () => {
    const result = tokenize('{{foo}} \\{{bar}} \\{{baz}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE', 'CONTENT', 'CONTENT', 'CONTENT']);
    shouldBeToken(result[3], 'CONTENT', ' ');
    shouldBeToken(result[4], 'CONTENT', '{{bar}} ');
    shouldBeToken(result[5], 'CONTENT', '{{baz}}');
  });

  it('supports escaping a triple stash', () => {
    const result = tokenize('{{foo}} \\{{{bar}}} {{baz}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE', 'CONTENT', 'CONTENT', 'OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[4], 'CONTENT', '{{{bar}}} ');
  });

  it('supports escaping escape character', () => {
    const result = tokenize('{{foo}} \\\\{{bar}} {{baz}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
    ]);
    shouldBeToken(result[3], 'CONTENT', ' \\');
    shouldBeToken(result[5], 'ID', 'bar');
  });

  it('supports escaping multiple escape characters', () => {
    const result = tokenize('{{foo}} \\\\{{bar}} \\\\{{baz}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
    ]);
    shouldBeToken(result[3], 'CONTENT', ' \\');
    shouldBeToken(result[5], 'ID', 'bar');
    shouldBeToken(result[7], 'CONTENT', ' \\');
    shouldBeToken(result[9], 'ID', 'baz');
  });

  it('supports escaped mustaches after escaped escape characters', () => {
    const result = tokenize('{{foo}} \\\\{{bar}} \\{{baz}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'CONTENT',
      'CONTENT',
    ]);
    shouldBeToken(result[3], 'CONTENT', ' \\');
    shouldBeToken(result[4], 'OPEN', '{{');
    shouldBeToken(result[5], 'ID', 'bar');
    shouldBeToken(result[7], 'CONTENT', ' ');
    shouldBeToken(result[8], 'CONTENT', '{{baz}}');
  });

  it('supports escaped escape characters after escaped mustaches', () => {
    const result = tokenize('{{foo}} \\{{bar}} \\\\{{baz}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'CONTENT',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
    ]);
    shouldBeToken(result[4], 'CONTENT', '{{bar}} ');
    shouldBeToken(result[5], 'CONTENT', '\\');
    shouldBeToken(result[6], 'OPEN', '{{');
    shouldBeToken(result[7], 'ID', 'baz');
  });

  it('supports escaped escape character on a triple stash', () => {
    const result = tokenize('{{foo}} \\\\{{{bar}}} {{baz}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN_UNESCAPED',
      'ID',
      'CLOSE_UNESCAPED',
      'CONTENT',
      'OPEN',
      'ID',
      'CLOSE',
    ]);
    shouldBeToken(result[3], 'CONTENT', ' \\');
    shouldBeToken(result[5], 'ID', 'bar');
  });

  // Path tokenization
  it('tokenizes a simple path', () => {
    const result = tokenize('{{foo/bar}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'CLOSE']);
  });

  it('allows dot notation', () => {
    const result = tokenize('{{foo.bar}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'CLOSE']);

    const result2 = tokenize('{{foo.bar.baz}}');
    shouldMatchTokens(result2, ['OPEN', 'ID', 'SEP', 'ID', 'SEP', 'ID', 'CLOSE']);
  });

  it('allows path literals with []', () => {
    const result = tokenize('{{foo.[bar]}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'CLOSE']);
  });

  it('allows multiple path literals on a line with []', () => {
    const result = tokenize('{{foo.[bar]}}{{foo.[baz]}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'SEP',
      'ID',
      'CLOSE',
      'OPEN',
      'ID',
      'SEP',
      'ID',
      'CLOSE',
    ]);
  });

  it('allows escaped literals in []', () => {
    const result = tokenize('{{foo.[bar\\]]}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'CLOSE']);
  });

  it('tokenizes {{.}} as OPEN ID CLOSE', () => {
    const result = tokenize('{{.}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE']);
  });

  it('tokenizes a path as "OPEN (ID SEP)* ID CLOSE"', () => {
    const result = tokenize('{{../foo/bar}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'SEP', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', '..');
  });

  it('tokenizes a path with .. as a parent path', () => {
    const result = tokenize('{{../foo.bar}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'SEP', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', '..');
  });

  it('tokenizes a path with this/foo as OPEN ID SEP ID CLOSE', () => {
    const result = tokenize('{{this/foo}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'SEP', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'this');
    shouldBeToken(result[3], 'ID', 'foo');
  });

  // Whitespace handling
  it('tokenizes a simple mustache with spaces as "OPEN ID CLOSE"', () => {
    const result = tokenize('{{  foo  }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
  });

  it('tokenizes a simple mustache with line breaks as "OPEN ID ID CLOSE"', () => {
    const result = tokenize('{{  foo  \n   bar }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
  });

  it('tokenizes raw content as "CONTENT"', () => {
    const result = tokenize('foo {{ bar }} baz');
    shouldMatchTokens(result, ['CONTENT', 'OPEN', 'ID', 'CLOSE', 'CONTENT']);
    shouldBeToken(result[0], 'CONTENT', 'foo ');
    shouldBeToken(result[4], 'CONTENT', ' baz');
  });

  // Comments
  it('tokenizes a comment as "COMMENT"', () => {
    const result = tokenize('foo {{! this is a comment }} bar {{ baz }}');
    shouldMatchTokens(result, ['CONTENT', 'COMMENT', 'CONTENT', 'OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'COMMENT', '{{! this is a comment }}');
  });

  it('tokenizes a block comment as "COMMENT"', () => {
    const result = tokenize('foo {{!-- this is a {{comment}} --}} bar {{ baz }}');
    shouldMatchTokens(result, ['CONTENT', 'COMMENT', 'CONTENT', 'OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'COMMENT', '{{!-- this is a {{comment}} --}}');
  });

  it('tokenizes a block comment with whitespace as "COMMENT"', () => {
    const result = tokenize('foo {{!-- this is a\n{{comment}}\n--}} bar {{ baz }}');
    shouldMatchTokens(result, ['CONTENT', 'COMMENT', 'CONTENT', 'OPEN', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'COMMENT', '{{!-- this is a\n{{comment}}\n--}}');
  });

  // Block helpers
  it('tokenizes open and closing blocks as OPEN_BLOCK, ID, CLOSE ..., OPEN_ENDBLOCK ID CLOSE', () => {
    const result = tokenize('{{#foo}}content{{/foo}}');
    shouldMatchTokens(result, [
      'OPEN_BLOCK',
      'ID',
      'CLOSE',
      'CONTENT',
      'OPEN_ENDBLOCK',
      'ID',
      'CLOSE',
    ]);
  });

  // Inverse sections
  it('tokenizes inverse sections as "INVERSE"', () => {
    const result1 = tokenize('{{^}}');
    shouldMatchTokens(result1, ['INVERSE']);

    const result2 = tokenize('{{else}}');
    shouldMatchTokens(result2, ['INVERSE']);

    const result3 = tokenize('{{ else }}');
    shouldMatchTokens(result3, ['INVERSE']);
  });

  it('tokenizes inverse sections with ID as "OPEN_INVERSE ID CLOSE"', () => {
    const result = tokenize('{{^foo}}');
    shouldMatchTokens(result, ['OPEN_INVERSE', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
  });

  it('tokenizes inverse sections with ID and spaces as "OPEN_INVERSE ID CLOSE"', () => {
    const result = tokenize('{{^ foo  }}');
    shouldMatchTokens(result, ['OPEN_INVERSE', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
  });

  // Parameters
  it('tokenizes mustaches with params as "OPEN ID ID ID CLOSE"', () => {
    const result = tokenize('{{ foo bar baz }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'ID', 'ID', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
    shouldBeToken(result[2], 'ID', 'bar');
    shouldBeToken(result[3], 'ID', 'baz');
  });

  // String literals
  it('tokenizes mustaches with String params as "OPEN ID ID STRING CLOSE"', () => {
    const result = tokenize('{{ foo bar "baz" }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'ID', 'STRING', 'CLOSE']);
    shouldBeToken(result[3], 'STRING', 'baz');
  });

  it('tokenizes mustaches with String params using single quotes as "OPEN ID ID STRING CLOSE"', () => {
    const result = tokenize("{{ foo bar 'baz' }}");
    shouldMatchTokens(result, ['OPEN', 'ID', 'ID', 'STRING', 'CLOSE']);
    shouldBeToken(result[3], 'STRING', 'baz');
  });

  it('tokenizes String params with spaces inside as "STRING"', () => {
    const result = tokenize('{{ foo bar "baz bat" }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'ID', 'STRING', 'CLOSE']);
    shouldBeToken(result[3], 'STRING', 'baz bat');
  });

  it('tokenizes String params with escaped quotes as STRING', () => {
    const result = tokenize('{{ foo "bar\\"baz" }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'STRING', 'CLOSE']);
    shouldBeToken(result[2], 'STRING', 'bar"baz');
  });

  it('tokenizes String params using single quotes with escaped quotes as STRING', () => {
    const result = tokenize("{{ foo 'bar\\'baz' }}");
    shouldMatchTokens(result, ['OPEN', 'ID', 'STRING', 'CLOSE']);
    shouldBeToken(result[2], 'STRING', "bar'baz");
  });

  // Number literals
  it('tokenizes numbers', () => {
    let result = tokenize('{{ foo 1 }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'NUMBER', 'CLOSE']);
    shouldBeToken(result[2], 'NUMBER', '1');

    result = tokenize('{{ foo 1.1 }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'NUMBER', 'CLOSE']);
    shouldBeToken(result[2], 'NUMBER', '1.1');

    result = tokenize('{{ foo -1 }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'NUMBER', 'CLOSE']);
    shouldBeToken(result[2], 'NUMBER', '-1');

    result = tokenize('{{ foo -1.1 }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'NUMBER', 'CLOSE']);
    shouldBeToken(result[2], 'NUMBER', '-1.1');
  });

  // Boolean literals
  it('tokenizes booleans', () => {
    let result = tokenize('{{ foo true }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'BOOLEAN', 'CLOSE']);
    shouldBeToken(result[2], 'BOOLEAN', 'true');

    result = tokenize('{{ foo false }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'BOOLEAN', 'CLOSE']);
    shouldBeToken(result[2], 'BOOLEAN', 'false');
  });

  // Undefined and null
  it('tokenizes undefined and null', () => {
    const result = tokenize('{{ foo undefined null }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'UNDEFINED', 'NULL', 'CLOSE']);
    shouldBeToken(result[2], 'UNDEFINED', 'undefined');
    shouldBeToken(result[3], 'NULL', 'null');
  });

  // @ identifiers
  it('tokenizes special @ identifiers', () => {
    let result = tokenize('{{ @foo }}');
    shouldMatchTokens(result, ['OPEN', 'DATA', 'ID', 'CLOSE']);
    shouldBeToken(result[2], 'ID', 'foo');

    result = tokenize('{{ foo @bar }}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'DATA', 'ID', 'CLOSE']);
    shouldBeToken(result[3], 'ID', 'bar');
  });

  // Error handling
  it('does not time out in a mustache with a single } followed by EOF', () => {
    const result = tokenize('{{foo}');
    shouldMatchTokens(result, ['OPEN', 'ID']);
  });

  it('does not time out in a mustache when invalid ID characters are used', () => {
    const result = tokenize('{{foo & }}');
    shouldMatchTokens(result, ['OPEN', 'ID']);
  });

  // Subexpressions
  it('tokenizes subexpressions', () => {
    let result = tokenize('{{foo (bar)}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'OPEN_SEXPR', 'ID', 'CLOSE_SEXPR', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
    shouldBeToken(result[3], 'ID', 'bar');

    result = tokenize('{{foo (a-x b-y)}}');
    shouldMatchTokens(result, ['OPEN', 'ID', 'OPEN_SEXPR', 'ID', 'ID', 'CLOSE_SEXPR', 'CLOSE']);
    shouldBeToken(result[1], 'ID', 'foo');
    shouldBeToken(result[3], 'ID', 'a-x');
    shouldBeToken(result[4], 'ID', 'b-y');
  });

  it('tokenizes nested subexpressions', () => {
    const result = tokenize('{{foo (bar (lol rofl)) (baz)}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'OPEN_SEXPR',
      'ID',
      'OPEN_SEXPR',
      'ID',
      'ID',
      'CLOSE_SEXPR',
      'CLOSE_SEXPR',
      'OPEN_SEXPR',
      'ID',
      'CLOSE_SEXPR',
      'CLOSE',
    ]);
    shouldBeToken(result[3], 'ID', 'bar');
    shouldBeToken(result[5], 'ID', 'lol');
    shouldBeToken(result[6], 'ID', 'rofl');
    shouldBeToken(result[10], 'ID', 'baz');
  });

  it('tokenizes nested subexpressions: literals', () => {
    const result = tokenize('{{foo (bar (lol true) false) (baz 1) (blah \'b\') (blorg "c")}}');
    shouldMatchTokens(result, [
      'OPEN',
      'ID',
      'OPEN_SEXPR',
      'ID',
      'OPEN_SEXPR',
      'ID',
      'BOOLEAN',
      'CLOSE_SEXPR',
      'BOOLEAN',
      'CLOSE_SEXPR',
      'OPEN_SEXPR',
      'ID',
      'NUMBER',
      'CLOSE_SEXPR',
      'OPEN_SEXPR',
      'ID',
      'STRING',
      'CLOSE_SEXPR',
      'OPEN_SEXPR',
      'ID',
      'STRING',
      'CLOSE_SEXPR',
      'CLOSE',
    ]);
  });

  // V2 features - SKIP
  it.skip('tokenizes a partial as "OPEN_PARTIAL ID CLOSE"', () => {
    // Partials are not supported in V1
  });

  it.skip('tokenizes a partial with context as "OPEN_PARTIAL ID ID CLOSE"', () => {
    // Partials are not supported in V1
  });

  it.skip('tokenizes a partial without spaces as "OPEN_PARTIAL ID CLOSE"', () => {
    // Partials are not supported in V1
  });

  it.skip('tokenizes a partial space at the }); as "OPEN_PARTIAL ID CLOSE"', () => {
    // Partials are not supported in V1
  });

  it.skip('tokenizes a partial space at the }); as "OPEN_PARTIAL ID CLOSE" (path)', () => {
    // Partials are not supported in V1
  });

  it.skip('tokenizes partial block declarations', () => {
    // Partial blocks are V2-only feature
  });

  it.skip('tokenizes directives', () => {
    // Decorators (*) are V2-only feature
  });

  it.skip('tokenizes hash arguments', () => {
    // Hash params require EQUALS token type - deferred until hash implementation
  });

  it.skip('tokenizes block params', () => {
    // Block params (as |foo|) are V2-only feature
  });

  it.skip('tokenizes raw blocks', () => {
    // Raw blocks ({{{{) are V2-only feature
  });

  it.skip('tokenizes hash arguments with @ identifiers', () => {
    // Requires EQUALS token - deferred with other hash tests
  });
});
