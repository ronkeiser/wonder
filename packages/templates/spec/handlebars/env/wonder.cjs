/**
 * Wonder Templates Runtime Environment
 *
 * This adapter makes the Handlebars spec tests run against our implementation.
 * It sets up the global environment expected by the Mocha tests.
 */

require('./common');

var chai = require('chai');
var dirtyChai = require('dirty-chai');

chai.use(dirtyChai);
global.expect = chai.expect;
global.sinon = require('sinon');

// Import our implementation
var wonder = require('../../../../src/index.js');

// Create a Handlebars-compatible API wrapper around our implementation
global.Handlebars = 'no-conflict';

var handlebarsEnv = {
  // Compile function - our implementation
  compile: function (template, options) {
    var compiled = wonder.compile(template);

    // Return Handlebars-compatible template function
    return function (context, runtimeOptions) {
      var mergedOptions = {};

      // Merge compile-time and runtime options
      if (runtimeOptions && runtimeOptions.helpers) {
        mergedOptions.helpers = runtimeOptions.helpers;
      }

      return compiled.render(context, mergedOptions);
    };
  },

  // Template function - for precompiled templates (not needed for runtime tests)
  template: function (spec) {
    return spec;
  },

  // SafeString for marking strings as HTML-safe
  SafeString:
    wonder.SafeString ||
    function (str) {
      this.string = str;
      this.toHTML = function () {
        return str;
      };
    },

  // Utils namespace
  Utils: {
    escapeExpression:
      wonder.escapeExpression ||
      function (str) {
        if (str == null) return '';
        str = String(str);
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/`/g, '&#x60;')
          .replace(/=/g, '&#x3D;');
      },

    isEmpty:
      wonder.isEmpty ||
      function (value) {
        if (value == null || value === false || value === '') {
          return true;
        }
        if (Array.isArray(value) && value.length === 0) {
          return true;
        }
        return false;
      },

    extend: function (obj, ...sources) {
      sources.forEach((source) => {
        if (source) {
          Object.keys(source).forEach((key) => {
            obj[key] = source[key];
          });
        }
      });
      return obj;
    },

    isArray: function (value) {
      return Array.isArray(value);
    },

    isFunction: function (value) {
      return typeof value === 'function';
    },
  },

  // Create a new isolated environment
  create: function () {
    return Object.create(handlebarsEnv);
  },

  // Exception class
  Exception: Error,
};

global.handlebarsEnv = handlebarsEnv;

// CompilerContext for tests that need it
global.CompilerContext = {
  browser: false,

  compile: function (template, options) {
    return handlebarsEnv.compile(template, options);
  },

  compileWithPartial: function (template, options) {
    // For now, partials are not supported in V1
    return handlebarsEnv.compile(template, options);
  },
};
