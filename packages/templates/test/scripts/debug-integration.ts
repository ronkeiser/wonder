import { Interpreter } from '../src/interpreter/interpreter.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

const template = 'Hello {{name}}!';
const context = { name: 'World' };

console.log('Template:', template);
console.log('Context:', context);

const lexer = new Lexer();
const tokens = lexer.tokenize(template);
console.log('\nTokens:', JSON.stringify(tokens, null, 2));

const parser = new Parser(tokens);
const ast = parser.parse();
console.log('\nAST:', JSON.stringify(ast, null, 2));

const interpreter = new Interpreter(ast);
const result = interpreter.evaluate(context);
console.log('\nResult:', JSON.stringify(result));
console.log('Result length:', result.length);
