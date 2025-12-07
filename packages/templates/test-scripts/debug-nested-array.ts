import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Interpreter } from '../src/interpreter/interpreter.js';

const template = '{{matrix.0.1}}';
const context = {
  matrix: [
    ['a', 'b'],
    ['c', 'd'],
  ],
};

const lexer = new Lexer();
const parser = new Parser(lexer);
parser.setInput(template);
const ast = parser.parse();
const interpreter = new Interpreter(ast);

console.log('Template:', template);
console.log('Context:', JSON.stringify(context, null, 2));
console.log('\nAST:', JSON.stringify(ast, null, 2));
console.log('\nResult:', interpreter.evaluate(context));
console.log('Expected: b');

// Test lookupProperty directly
import { lookupProperty } from '../src/runtime/utils.js';
console.log('\nDirect lookupProperty tests:');
const arr = [['a', 'b'], ['c', 'd']];
console.log('Array:', arr);
console.log('lookupProperty(arr, "0"):', lookupProperty(arr, '0'));
console.log('lookupProperty(arr, "1"):', lookupProperty(arr, '1'));
console.log('arr["0"]:', arr['0']);
console.log('arr[0]:', arr[0]);
console.log('hasOwnProperty.call(arr, "0"):', Object.hasOwnProperty.call(arr, '0'));
console.log('hasOwnProperty.call(arr, "1"):', Object.hasOwnProperty.call(arr, '1'));

const inner = ['a', 'b'];
console.log('\nInner array:', inner);
console.log('lookupProperty(inner, "1"):', lookupProperty(inner, '1'));
console.log('inner["1"]:', inner['1']);
console.log('inner[1]:', inner[1]);
console.log('hasOwnProperty.call(inner, "1"):', Object.hasOwnProperty.call(inner, '1'));
