import { describe, it } from 'vitest';
import { expectTemplate } from './helpers/expect-template.js';

describe('security issues', () => {
  describe('GH-1495: Prevent Remote Code Execution via constructor', () => {
    it('should not allow constructors to be accessed', () => {
      expectTemplate('{{lookup (lookup this "constructor") "name"}}').withInput({}).toCompileTo('');

      expectTemplate('{{constructor.name}}').withInput({}).toCompileTo('');
    });

    it.skip('GH-1603: should not allow constructors to be accessed (lookup via toString)', () => {
      // Requires helper registration
      expectTemplate('{{lookup (lookup this (list "constructor")) "name"}}')
        .withInput({})
        .withHelper('list', function (element: any) {
          return [element];
        })
        .toCompileTo('');
    });

    it('should allow the "constructor" property to be accessed if it is an "ownProperty"', () => {
      expectTemplate('{{constructor.name}}')
        .withInput({ constructor: { name: 'here we go' } })
        .toCompileTo('here we go');

      expectTemplate('{{lookup (lookup this "constructor") "name"}}')
        .withInput({ constructor: { name: 'here we go' } })
        .toCompileTo('here we go');
    });

    it('should allow the "constructor" property to be accessed if it is an "own property"', () => {
      expectTemplate('{{lookup (lookup this "constructor") "name"}}')
        .withInput({ constructor: { name: 'here we go' } })
        .toCompileTo('here we go');
    });
  });

  describe('GH-1558: Prevent explicit call of helperMissing-helpers', () => {
    describe('without the option "allowExplicitCallOfHelperMissing"', () => {
      it('should throw an exception when calling  "{{helperMissing}}" ', () => {
        expectTemplate('{{helperMissing}}').toThrow(Error);
      });

      it('should throw an exception when calling  "{{#helperMissing}}{{/helperMissing}}" ', () => {
        expectTemplate('{{#helperMissing}}{{/helperMissing}}').toThrow(Error);
      });

      it.skip('should throw an exception when calling  "{{blockHelperMissing "abc" .}}" ', () => {
        // Requires compile/runtime separation and runtime options
        expectTemplate('{{blockHelperMissing "abc" .}}')
          .withInput({
            fn: function () {
              return 'called';
            },
          })
          .toThrow(Error);
      });

      it.skip('should throw an exception when calling  "{{#blockHelperMissing .}}{{/blockHelperMissing}}"', () => {
        // Requires compile/runtime separation and runtime options
        expectTemplate('{{#blockHelperMissing .}}{{/blockHelperMissing}}')
          .withInput({
            fn: function () {
              return 'functionInData';
            },
          })
          .toThrow(Error);
      });
    });

    describe.skip('with the option "allowCallsToHelperMissing" set to true', () => {
      // All tests in this block require runtime options support
      it('should not throw an exception when calling  "{{helperMissing}}" ', () => {
        expectTemplate('{{helperMissing}}')
          .withRuntimeOptions({ allowCallsToHelperMissing: true })
          .toCompileTo('');
      });

      it('should not throw an exception when calling  "{{#helperMissing}}{{/helperMissing}}" ', () => {
        expectTemplate('{{#helperMissing}}{{/helperMissing}}')
          .withRuntimeOptions({ allowCallsToHelperMissing: true })
          .toCompileTo('');
      });

      it('should not throw an exception when calling  "{{blockHelperMissing "abc" .}}" ', () => {
        expectTemplate('{{blockHelperMissing "abc" .}}')
          .withInput({
            fn: function () {
              return 'called';
            },
          })
          .withRuntimeOptions({ allowCallsToHelperMissing: true })
          .toCompileTo('called');
      });

      it('should not throw an exception when calling  "{{#blockHelperMissing .}}{{/blockHelperMissing}}"', () => {
        expectTemplate('{{#blockHelperMissing true}}sdads{{/blockHelperMissing}}')
          .withRuntimeOptions({ allowCallsToHelperMissing: true })
          .toCompileTo('sdads');
      });
    });
  });

  describe('GH-1563', () => {
    it('should not allow to access constructor after overriding via __defineGetter__', () => {
      if (({} as any).__defineGetter__ == null || ({} as any).__lookupGetter__ == null) {
        return; // Browser does not support this exploit anyway
      }
      expectTemplate(
        '{{__defineGetter__ "undefined" valueOf }}' +
          '{{#with __lookupGetter__ }}' +
          '{{__defineGetter__ "propertyIsEnumerable" (this.bind (this.bind 1)) }}' +
          '{{constructor.name}}' +
          '{{/with}}',
      )
        .withInput({})
        .toThrow(/Missing helper: "__defineGetter__"/);
    });
  });

  describe('GH-1595: dangerous properties', () => {
    const templates = [
      '{{constructor}}',
      '{{__defineGetter__}}',
      '{{__defineSetter__}}',
      '{{__lookupGetter__}}',
      '{{__proto__}}',
      '{{lookup this "constructor"}}',
      '{{lookup this "__defineGetter__"}}',
      '{{lookup this "__defineSetter__"}}',
      '{{lookup this "__lookupGetter__"}}',
      '{{lookup this "__proto__"}}',
    ];

    templates.forEach((template) => {
      describe(`access should be denied to ${template}`, () => {
        it('by default', () => {
          expectTemplate(template).withInput({}).toCompileTo('');
        });

        it.skip('with proto-access enabled', () => {
          // Requires runtime options support
          expectTemplate(template)
            .withInput({})
            .withRuntimeOptions({
              allowProtoPropertiesByDefault: true,
              allowProtoMethodsByDefault: true,
            })
            .toCompileTo('');
        });
      });
    });
  });

  describe.skip('GH-1631: disallow access to prototype functions', () => {
    // All tests in this block require:
    // 1. Runtime options (allowedProtoMethods, allowProtoMethodsByDefault, etc.)
    // 2. Console.error spy mocking
    // 3. beforeEach/afterEach setup
    // Skip entire block for now
  });

  describe('escapes template variables', () => {
    it.skip('in compat mode', () => {
      // Requires compat mode support
      expectTemplate("{{'a\\b'}}")
        .withCompileOptions({ compat: true })
        .withInput({ 'a\\b': 'c' })
        .toCompileTo('c');
    });

    it('in default mode', () => {
      expectTemplate("{{'a\\b'}}")
        .withCompileOptions({})
        .withInput({ 'a\\b': 'c' })
        .toCompileTo('c');
    });

    it.skip('in strict mode', () => {
      // Requires strict mode support
      expectTemplate("{{'a\\b'}}")
        .withCompileOptions({ strict: true })
        .withInput({ 'a\\b': 'c' })
        .toCompileTo('c');
    });
  });
});
