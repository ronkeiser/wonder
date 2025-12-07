#!/usr/bin/env node
/**
 * Wonder Templates Spec Test Runner
 *
 * Runs Handlebars spec tests against our implementation.
 * Usage: node run-spec.js [test-file-pattern]
 */

var fs = require('fs');
var Mocha = require('mocha');
var path = require('path');

var testDir = path.join(__dirname, '..');
var grep = process.argv[2];

// Find all test files
var files = fs
  .readdirSync(testDir)
  .filter(function (name) {
    // Only include test files, not env/, artifacts/, etc.
    if (!/\.js$/.test(name)) return false;
    if (name === '.eslintrc.js') return false;

    // Skip certain tests we can't support
    var skipFiles = [
      'precompiler.js', // Precompilation not in V1 scope
      'compiler.js', // Compiler internals not relevant
      'javascript-compiler.js', // Code generation not relevant
      'source-map.js', // Source maps not in V1 scope
      'require.js', // Node.js require() not relevant
      'spec.js', // Mustache spec - different engine
      'ast.js', // AST manipulation not in V1 scope
      'tokenizer.js', // Lexer tests - internal implementation
      'runtime.js', // Runtime specific tests
    ];

    if (skipFiles.indexOf(name) !== -1) return false;

    // If grep pattern provided, filter by it
    if (grep && name.indexOf(grep) === -1) return false;

    return true;
  })
  .map(function (name) {
    return path.join(testDir, name);
  });

console.log('Running Wonder Templates against Handlebars spec...');
console.log('Test files:', files.map((f) => path.basename(f)).join(', '));
console.log('');

// Set up Mocha
var mocha = new Mocha({
  ui: 'bdd',
  reporter: 'spec',
  timeout: 5000,
});

// Load our environment before tests
require('./env/wonder.js');

// Add test files
files.forEach(function (file) {
  mocha.addFile(file);
});

// Run tests
mocha.run(function (failures) {
  process.exitCode = failures ? 1 : 0;
});
