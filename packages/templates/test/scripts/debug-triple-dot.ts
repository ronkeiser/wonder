import { Lexer } from './src/lexer/lexer.js';

const lexer = new Lexer();

console.log('=== Tokenizing {{foo...}} ===');
lexer.setInput('{{foo...}}');
let token = lexer.lex();
while (token && token.type !== 'EOF') {
  console.log(`${token.type}: "${token.value}"`);
  token = lexer.lex();
}
