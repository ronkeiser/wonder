import { Lexer } from './src/lexer/lexer.js';
import { Parser } from './src/parser/parser.js';

const lexer = new Lexer();
const parser = new Parser(lexer);

console.log('=== Our parsing of {{  foo  .  bar  }} ===');
lexer.setInput('{{  foo  .  bar  }}');
const ast = parser.parseProgram();
console.log(JSON.stringify(ast, null, 2));
