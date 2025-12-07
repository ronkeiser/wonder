import { describe, it } from 'vitest';
import { expectTemplate } from './helpers/expect-template.js';

describe('blocks', () => {
  // ===== Basic Block Tests (9 tests) =====

  it('array', () => {
    const string = '{{#goodbyes}}{{text}}! {{/goodbyes}}cruel {{world}}!';

    expectTemplate(string)
      .withInput({
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
        world: 'world',
      })
      .toCompileTo('goodbye! Goodbye! GOODBYE! cruel world!');

    expectTemplate(string)
      .withInput({
        goodbyes: [],
        world: 'world',
      })
      .toCompileTo('cruel world!');
  });

  it('array without data', () => {
    expectTemplate('{{#goodbyes}}{{text}}{{/goodbyes}} {{#goodbyes}}{{text}}{{/goodbyes}}')
      .withInput({
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
        world: 'world',
      })
      .toCompileTo('goodbyeGoodbyeGOODBYE goodbyeGoodbyeGOODBYE');
  });

  it('array with @index', () => {
    expectTemplate('{{#goodbyes}}{{@index}}. {{text}}! {{/goodbyes}}cruel {{world}}!')
      .withInput({
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
        world: 'world',
      })
      .toCompileTo('0. goodbye! 1. Goodbye! 2. GOODBYE! cruel world!');
  });

  it('empty block', () => {
    const string = '{{#goodbyes}}{{/goodbyes}}cruel {{world}}!';

    expectTemplate(string)
      .withInput({
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
        world: 'world',
      })
      .toCompileTo('cruel world!');

    expectTemplate(string)
      .withInput({
        goodbyes: [],
        world: 'world',
      })
      .toCompileTo('cruel world!');
  });

  it('block with complex lookup', () => {
    expectTemplate('{{#goodbyes}}{{text}} cruel {{../name}}! {{/goodbyes}}')
      .withInput({
        name: 'Alan',
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
      })
      .toCompileTo('goodbye cruel Alan! Goodbye cruel Alan! GOODBYE cruel Alan! ');
  });

  it('multiple blocks with complex lookup', () => {
    expectTemplate('{{#goodbyes}}{{../name}}{{../name}}{{/goodbyes}}')
      .withInput({
        name: 'Alan',
        goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
      })
      .toCompileTo('AlanAlanAlanAlanAlanAlan');
  });

  it('block with complex lookup using nested context', () => {
    expectTemplate('{{#goodbyes}}{{text}} cruel {{foo/../name}}! {{/goodbyes}}').toThrow(Error);
  });

  it('block with deep nested complex lookup', () => {
    expectTemplate(
      '{{#outer}}Goodbye {{#inner}}cruel {{../sibling}} {{../../omg}}{{/inner}}{{/outer}}',
    )
      .withInput({
        omg: 'OMG!',
        outer: [{ sibling: 'sad', inner: [{ text: 'goodbye' }] }],
      })
      .toCompileTo('Goodbye cruel sad OMG!');
  });

  it('works with cached blocks', () => {
    expectTemplate('{{#each person}}{{#with .}}{{first}} {{last}}{{/with}}{{/each}}')
      .withInput({
        person: [
          { first: 'Alan', last: 'Johnson' },
          { first: 'Alan', last: 'Johnson' },
        ],
      })
      .toCompileTo('Alan JohnsonAlan Johnson');
  });

  // ===== Inverted Sections (7 tests) =====

  describe('inverted sections', () => {
    it('inverted sections with unset value', () => {
      expectTemplate(
        '{{#goodbyes}}{{this}}{{/goodbyes}}{{^goodbyes}}Right On!{{/goodbyes}}',
      ).toCompileTo('Right On!');
    });

    it('inverted section with false value', () => {
      expectTemplate('{{#goodbyes}}{{this}}{{/goodbyes}}{{^goodbyes}}Right On!{{/goodbyes}}')
        .withInput({ goodbyes: false })
        .toCompileTo('Right On!');
    });

    it('inverted section with empty set', () => {
      expectTemplate('{{#goodbyes}}{{this}}{{/goodbyes}}{{^goodbyes}}Right On!{{/goodbyes}}')
        .withInput({ goodbyes: [] })
        .toCompileTo('Right On!');
    });

    it('block inverted sections', () => {
      expectTemplate('{{#people}}{{name}}{{^}}{{none}}{{/people}}')
        .withInput({ none: 'No people' })
        .toCompileTo('No people');
    });

    it('chained inverted sections', () => {
      expectTemplate('{{#people}}{{name}}{{else if none}}{{none}}{{/people}}')
        .withInput({ none: 'No people' })
        .toCompileTo('No people');

      expectTemplate(
        '{{#people}}{{name}}{{else if nothere}}fail{{else unless nothere}}{{none}}{{/people}}',
      )
        .withInput({ none: 'No people' })
        .toCompileTo('No people');

      expectTemplate('{{#people}}{{name}}{{else if none}}{{none}}{{else}}fail{{/people}}')
        .withInput({ none: 'No people' })
        .toCompileTo('No people');
    });

    it('chained inverted sections with mismatch', () => {
      expectTemplate('{{#people}}{{name}}{{else if none}}{{none}}{{/if}}').toThrow(Error);
    });

    it('block inverted sections with empty arrays', () => {
      expectTemplate('{{#people}}{{name}}{{^}}{{none}}{{/people}}')
        .withInput({
          none: 'No people',
          people: [],
        })
        .toCompileTo('No people');
    });
  });

  // ===== Standalone Sections (3 keep, 1 skip) =====

  describe('standalone sections', () => {
    it('block standalone else sections', () => {
      expectTemplate('{{#people}}\n{{name}}\n{{^}}\n{{none}}\n{{/people}}\n')
        .withInput({ none: 'No people' })
        .toCompileTo('No people\n');

      expectTemplate('{{#none}}\n{{.}}\n{{^}}\n{{none}}\n{{/none}}\n')
        .withInput({ none: 'No people' })
        .toCompileTo('No people\n');

      expectTemplate('{{#people}}\n{{name}}\n{{^}}\n{{none}}\n{{/people}}\n')
        .withInput({ none: 'No people' })
        .toCompileTo('No people\n');
    });

    it.skip('block standalone else sections can be disabled', () => {
      // SKIP: ignoreStandalone compile option not in V1 requirements
      expectTemplate('{{#people}}\n{{name}}\n{{^}}\n{{none}}\n{{/people}}\n')
        .withInput({ none: 'No people' })
        .withCompileOptions({ ignoreStandalone: true })
        .toCompileTo('\nNo people\n\n');

      expectTemplate('{{#none}}\n{{.}}\n{{^}}\nFail\n{{/none}}\n')
        .withInput({ none: 'No people' })
        .withCompileOptions({ ignoreStandalone: true })
        .toCompileTo('\nNo people\n\n');
    });

    it('block standalone chained else sections', () => {
      expectTemplate('{{#people}}\n{{name}}\n{{else if none}}\n{{none}}\n{{/people}}\n')
        .withInput({ none: 'No people' })
        .toCompileTo('No people\n');

      expectTemplate('{{#people}}\n{{name}}\n{{else if none}}\n{{none}}\n{{^}}\n{{/people}}\n')
        .withInput({ none: 'No people' })
        .toCompileTo('No people\n');
    });

    it('should handle nesting', () => {
      expectTemplate('{{#data}}\n{{#if true}}\n{{.}}\n{{/if}}\n{{/data}}\nOK.')
        .withInput({
          data: [1, 3, 5],
        })
        .toCompileTo('1\n3\n5\nOK.');
    });
  });

  // ===== Compat Mode (3 tests) - SKIP =====

  describe('compat mode', () => {
    it.skip('block with deep recursive lookup lookup', () => {
      // SKIP: Mustache compat mode not in V1 requirements
      expectTemplate('{{#outer}}Goodbye {{#inner}}cruel {{omg}}{{/inner}}{{/outer}}')
        .withInput({ omg: 'OMG!', outer: [{ inner: [{ text: 'goodbye' }] }] })
        .withCompileOptions({ compat: true })
        .toCompileTo('Goodbye cruel OMG!');
    });

    it.skip('block with deep recursive pathed lookup', () => {
      // SKIP: Mustache compat mode not in V1 requirements
      expectTemplate('{{#outer}}Goodbye {{#inner}}cruel {{omg.yes}}{{/inner}}{{/outer}}')
        .withInput({
          omg: { yes: 'OMG!' },
          outer: [{ inner: [{ yes: 'no', text: 'goodbye' }] }],
        })
        .withCompileOptions({ compat: true })
        .toCompileTo('Goodbye cruel OMG!');
    });

    it.skip('block with missed recursive lookup', () => {
      // SKIP: Mustache compat mode not in V1 requirements
      expectTemplate('{{#outer}}Goodbye {{#inner}}cruel {{omg.yes}}{{/inner}}{{/outer}}')
        .withInput({
          omg: { no: 'OMG!' },
          outer: [{ inner: [{ yes: 'no', text: 'goodbye' }] }],
        })
        .withCompileOptions({ compat: true })
        .toCompileTo('Goodbye cruel ');
    });
  });

  // ===== Decorators (11 tests) - SKIP =====

  describe('decorators', () => {
    it.skip('should apply mustache decorators', () => {
      // SKIP: Decorator syntax {{*decorator}} not in V1 requirements
      expectTemplate('{{#helper}}{{*decorator}}{{/helper}}')
        .withHelper('helper', function (this: any, options: any) {
          return options.fn.run;
        })
        .withDecorator('decorator', function (fn: any) {
          fn.run = 'success';
          return fn;
        })
        .toCompileTo('success');
    });

    it.skip('should apply allow undefined return', () => {
      // SKIP: Decorator syntax not in V1 requirements
      expectTemplate('{{#helper}}{{*decorator}}suc{{/helper}}')
        .withHelper('helper', function (this: any, options: any) {
          return options.fn() + options.fn.run;
        })
        .withDecorator('decorator', function (fn: any) {
          fn.run = 'cess';
        })
        .toCompileTo('success');
    });

    it.skip('should apply block decorators', () => {
      // SKIP: Decorator syntax not in V1 requirements
      expectTemplate('{{#helper}}{{#*decorator}}success{{/decorator}}{{/helper}}')
        .withHelper('helper', function (this: any, options: any) {
          return options.fn.run;
        })
        .withDecorator('decorator', function (fn: any, props: any, container: any, options: any) {
          fn.run = options.fn();
          return fn;
        })
        .toCompileTo('success');
    });

    it.skip('should support nested decorators', () => {
      // SKIP: Decorator syntax not in V1 requirements
      expectTemplate(
        '{{#helper}}{{#*decorator}}{{#*nested}}suc{{/nested}}cess{{/decorator}}{{/helper}}',
      )
        .withHelper('helper', function (this: any, options: any) {
          return options.fn.run;
        })
        .withHelpers({
          decorator: function (fn: any, props: any, container: any, options: any) {
            fn.run = options.fn.nested + options.fn();
            return fn;
          },
          nested: function (fn: any, props: any, container: any, options: any) {
            props.nested = options.fn();
          },
        })
        .toCompileTo('success');
    });

    it.skip('should apply multiple decorators', () => {
      // SKIP: Decorator syntax not in V1 requirements
      expectTemplate(
        '{{#helper}}{{#*decorator}}suc{{/decorator}}{{#*decorator}}cess{{/decorator}}{{/helper}}',
      )
        .withHelper('helper', function (this: any, options: any) {
          return options.fn.run;
        })
        .withDecorator('decorator', function (fn: any, props: any, container: any, options: any) {
          fn.run = (fn.run || '') + options.fn();
          return fn;
        })
        .toCompileTo('success');
    });

    it.skip('should access parent variables', () => {
      // SKIP: Decorator syntax not in V1 requirements
      expectTemplate('{{#helper}}{{*decorator foo}}{{/helper}}')
        .withHelper('helper', function (this: any, options: any) {
          return options.fn.run;
        })
        .withDecorator('decorator', function (fn: any, props: any, container: any, options: any) {
          fn.run = options.args;
          return fn;
        })
        .withInput({ foo: 'success' })
        .toCompileTo('success');
    });

    it.skip('should work with root program', () => {
      // SKIP: Decorator syntax not in V1 requirements
      let run: boolean;
      expectTemplate('{{*decorator "success"}}')
        .withDecorator('decorator', function (fn: any, props: any, container: any, options: any) {
          // equals(options.args[0], 'success');
          run = true;
          return fn;
        })
        .withInput({ foo: 'success' })
        .toCompileTo('');
      // equals(run, true);
    });

    it.skip('should fail when accessing variables from root', () => {
      // SKIP: Decorator syntax not in V1 requirements
      let run: boolean;
      expectTemplate('{{*decorator foo}}')
        .withDecorator('decorator', function (fn: any, props: any, container: any, options: any) {
          // equals(options.args[0], undefined);
          run = true;
          return fn;
        })
        .withInput({ foo: 'fail' })
        .toCompileTo('');
      // equals(run, true);
    });

    describe('registration', () => {
      it.skip('unregisters', () => {
        // SKIP: Decorator registration not in V1 requirements
        // handlebarsEnv.decorators = {};
        // handlebarsEnv.registerDecorator('foo', function () {
        //   return 'fail';
        // });
        // equals(!!handlebarsEnv.decorators.foo, true);
        // handlebarsEnv.unregisterDecorator('foo');
        // equals(handlebarsEnv.decorators.foo, undefined);
      });

      it.skip('allows multiple globals', () => {
        // SKIP: Decorator registration not in V1 requirements
        // handlebarsEnv.decorators = {};
        // handlebarsEnv.registerDecorator({
        //   foo: function () {},
        //   bar: function () {},
        // });
        // equals(!!handlebarsEnv.decorators.foo, true);
        // equals(!!handlebarsEnv.decorators.bar, true);
        // handlebarsEnv.unregisterDecorator('foo');
        // handlebarsEnv.unregisterDecorator('bar');
        // equals(handlebarsEnv.decorators.foo, undefined);
        // equals(handlebarsEnv.decorators.bar, undefined);
      });

      it.skip('fails with multiple and args', () => {
        // SKIP: Decorator registration not in V1 requirements
        // shouldThrow(
        //   function () {
        //     handlebarsEnv.registerDecorator(
        //       {
        //         world: function () {
        //           return 'world!';
        //         },
        //         testHelper: function () {
        //           return 'found it!';
        //         },
        //       },
        //       {}
        //     );
        //   },
        //   Error,
        //   'Arg not supported with multiple decorators'
        // );
      });
    });
  });
});
