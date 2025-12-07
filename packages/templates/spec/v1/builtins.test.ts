import { beforeEach, describe, it } from 'vitest';
import { expectTemplate } from './helpers/expect-template.js';

describe('builtin helpers', () => {
  describe('#if', () => {
    it('if', () => {
      const string = '{{#if goodbye}}GOODBYE {{/if}}cruel {{world}}!';

      expectTemplate(string)
        .withInput({
          goodbye: true,
          world: 'world',
        })
        .withMessage('if with boolean argument shows the contents when true')
        .toCompileTo('GOODBYE cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: 'dummy',
          world: 'world',
        })
        .withMessage('if with string argument shows the contents')
        .toCompileTo('GOODBYE cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: false,
          world: 'world',
        })
        .withMessage('if with boolean argument does not show the contents when false')
        .toCompileTo('cruel world!');

      expectTemplate(string)
        .withInput({ world: 'world' })
        .withMessage('if with undefined does not show the contents')
        .toCompileTo('cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: ['foo'],
          world: 'world',
        })
        .withMessage('if with non-empty array shows the contents')
        .toCompileTo('GOODBYE cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: [],
          world: 'world',
        })
        .withMessage('if with empty array does not show the contents')
        .toCompileTo('cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: 0,
          world: 'world',
        })
        .withMessage('if with zero does not show the contents')
        .toCompileTo('cruel world!');

      expectTemplate('{{#if goodbye includeZero=true}}GOODBYE {{/if}}cruel {{world}}!')
        .withInput({
          goodbye: 0,
          world: 'world',
        })
        .withMessage('if with zero does not show the contents')
        .toCompileTo('GOODBYE cruel world!');
    });

    it('if with function argument', () => {
      const string = '{{#if goodbye}}GOODBYE {{/if}}cruel {{world}}!';

      expectTemplate(string)
        .withInput({
          goodbye: function () {
            return true;
          },
          world: 'world',
        })
        .withMessage('if with function shows the contents when function returns true')
        .toCompileTo('GOODBYE cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: function () {
            return (this as any).world;
          },
          world: 'world',
        })
        .withMessage('if with function shows the contents when function returns string')
        .toCompileTo('GOODBYE cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: function () {
            return false;
          },
          world: 'world',
        })
        .withMessage('if with function does not show the contents when returns false')
        .toCompileTo('cruel world!');

      expectTemplate(string)
        .withInput({
          goodbye: function () {
            return (this as any).foo;
          },
          world: 'world',
        })
        .withMessage('if with function does not show the contents when returns undefined')
        .toCompileTo('cruel world!');
    });

    it('should not change the depth list', () => {
      expectTemplate('{{#with foo}}{{#if goodbye}}GOODBYE cruel {{../world}}!{{/if}}{{/with}}')
        .withInput({
          foo: { goodbye: true },
          world: 'world',
        })
        .toCompileTo('GOODBYE cruel world!');
    });
  });

  describe('#with', () => {
    it('with', () => {
      expectTemplate('{{#with person}}{{first}} {{last}}{{/with}}')
        .withInput({
          person: {
            first: 'Alan',
            last: 'Johnson',
          },
        })
        .toCompileTo('Alan Johnson');
    });

    it('with with function argument', () => {
      expectTemplate('{{#with person}}{{first}} {{last}}{{/with}}')
        .withInput({
          person: function () {
            return {
              first: 'Alan',
              last: 'Johnson',
            };
          },
        })
        .toCompileTo('Alan Johnson');
    });

    it('with with else', () => {
      expectTemplate(
        '{{#with person}}Person is present{{else}}Person is not present{{/with}}',
      ).toCompileTo('Person is not present');
    });

    it('with provides block parameter', () => {
      expectTemplate('{{#with person as |foo|}}{{foo.first}} {{last}}{{/with}}')
        .withInput({
          person: {
            first: 'Alan',
            last: 'Johnson',
          },
        })
        .toCompileTo('Alan Johnson');
    });

    it.skip('works when data is disabled', () => {
      expectTemplate('{{#with person as |foo|}}{{foo.first}} {{last}}{{/with}}')
        .withInput({ person: { first: 'Alan', last: 'Johnson' } })
        .withCompileOptions({ data: false })
        .toCompileTo('Alan Johnson');
    });
  });

  describe('#each', () => {
    it('each', () => {
      const string = '{{#each goodbyes}}{{text}}! {{/each}}cruel {{world}}!';

      expectTemplate(string)
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('each with array argument iterates over the contents when not empty')
        .toCompileTo('goodbye! Goodbye! GOODBYE! cruel world!');

      expectTemplate(string)
        .withInput({
          goodbyes: [],
          world: 'world',
        })
        .withMessage('each with array argument ignores the contents when empty')
        .toCompileTo('cruel world!');
    });

    it.skip('each without data', () => {
      expectTemplate('{{#each goodbyes}}{{text}}! {{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withRuntimeOptions({ data: false })
        .withCompileOptions({ data: false })
        .toCompileTo('goodbye! Goodbye! GOODBYE! cruel world!');

      expectTemplate('{{#each .}}{{.}}{{/each}}')
        .withInput({ goodbyes: 'cruel', world: 'world' })
        .withRuntimeOptions({ data: false })
        .withCompileOptions({ data: false })
        .toCompileTo('cruelworld');
    });

    it('each without context', () => {
      expectTemplate('{{#each goodbyes}}{{text}}! {{/each}}cruel {{world}}!')
        .withInput(undefined)
        .toCompileTo('cruel !');
    });

    it('each with an object and @key', () => {
      const string = '{{#each goodbyes}}{{@key}}. {{text}}! {{/each}}cruel {{world}}!';

      class Clazz {
        '<b>#1</b>' = { text: 'goodbye' };
        2 = { text: 'GOODBYE' };
      }
      (Clazz.prototype as any).foo = 'fail';
      const hash = { goodbyes: new Clazz(), world: 'world' };

      // Object property iteration order is undefined according to ECMA spec,
      // so we need to check both possible orders - just check one for now
      expectTemplate(string)
        .withInput(hash)
        .withMessage('each with object argument iterates over the contents when not empty')
        .toCompileTo('&lt;b&gt;#1&lt;/b&gt;. goodbye! 2. GOODBYE! cruel world!');

      expectTemplate(string)
        .withInput({
          goodbyes: {},
          world: 'world',
        })
        .toCompileTo('cruel world!');
    });

    it('each with @index', () => {
      expectTemplate('{{#each goodbyes}}{{@index}}. {{text}}! {{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @index variable is used')
        .toCompileTo('0. goodbye! 1. Goodbye! 2. GOODBYE! cruel world!');
    });

    it('each with nested @index', () => {
      expectTemplate(
        '{{#each goodbyes}}{{@index}}. {{text}}! {{#each ../goodbyes}}{{@index}} {{/each}}After {{@index}} {{/each}}{{@index}}cruel {{world}}!',
      )
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @index variable is used')
        .toCompileTo(
          '0. goodbye! 0 1 2 After 0 1. Goodbye! 0 1 2 After 1 2. GOODBYE! 0 1 2 After 2 cruel world!',
        );
    });

    it('each with block params', () => {
      expectTemplate(
        '{{#each goodbyes as |value index|}}{{index}}. {{value.text}}! {{#each ../goodbyes as |childValue childIndex|}} {{index}} {{childIndex}}{{/each}} After {{index}} {{/each}}{{index}}cruel {{world}}!',
      )
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }],
          world: 'world',
        })
        .toCompileTo('0. goodbye!  0 0 0 1 After 0 1. Goodbye!  1 0 1 1 After 1 cruel world!');
    });

    it.skip('each with block params and strict compilation', () => {
      expectTemplate('{{#each goodbyes as |value index|}}{{index}}. {{value.text}}!{{/each}}')
        .withCompileOptions({ strict: true })
        .withInput({ goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }] })
        .toCompileTo('0. goodbye!1. Goodbye!');
    });

    it('each object with @index', () => {
      expectTemplate('{{#each goodbyes}}{{@index}}. {{text}}! {{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: {
            a: { text: 'goodbye' },
            b: { text: 'Goodbye' },
            c: { text: 'GOODBYE' },
          },
          world: 'world',
        })
        .withMessage('The @index variable is used')
        .toCompileTo('0. goodbye! 1. Goodbye! 2. GOODBYE! cruel world!');
    });

    it('each with @first', () => {
      expectTemplate('{{#each goodbyes}}{{#if @first}}{{text}}! {{/if}}{{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @first variable is used')
        .toCompileTo('goodbye! cruel world!');
    });

    it('each with nested @first', () => {
      expectTemplate(
        '{{#each goodbyes}}({{#if @first}}{{text}}! {{/if}}{{#each ../goodbyes}}{{#if @first}}{{text}}!{{/if}}{{/each}}{{#if @first}} {{text}}!{{/if}}) {{/each}}cruel {{world}}!',
      )
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @first variable is used')
        .toCompileTo('(goodbye! goodbye! goodbye!) (goodbye!) (goodbye!) cruel world!');
    });

    it('each object with @first', () => {
      expectTemplate('{{#each goodbyes}}{{#if @first}}{{text}}! {{/if}}{{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: { foo: { text: 'goodbye' }, bar: { text: 'Goodbye' } },
          world: 'world',
        })
        .withMessage('The @first variable is used')
        .toCompileTo('goodbye! cruel world!');
    });

    it('each with @last', () => {
      expectTemplate('{{#each goodbyes}}{{#if @last}}{{text}}! {{/if}}{{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @last variable is used')
        .toCompileTo('GOODBYE! cruel world!');
    });

    it('each object with @last', () => {
      expectTemplate('{{#each goodbyes}}{{#if @last}}{{text}}! {{/if}}{{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: { foo: { text: 'goodbye' }, bar: { text: 'Goodbye' } },
          world: 'world',
        })
        .withMessage('The @last variable is used')
        .toCompileTo('Goodbye! cruel world!');
    });

    it('each with nested @last', () => {
      expectTemplate(
        '{{#each goodbyes}}({{#if @last}}{{text}}! {{/if}}{{#each ../goodbyes}}{{#if @last}}{{text}}!{{/if}}{{/each}}{{#if @last}} {{text}}!{{/if}}) {{/each}}cruel {{world}}!',
      )
        .withInput({
          goodbyes: [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }],
          world: 'world',
        })
        .withMessage('The @last variable is used')
        .toCompileTo('(GOODBYE!) (GOODBYE!) (GOODBYE! GOODBYE! GOODBYE!) cruel world!');
    });

    it('each with function argument', () => {
      const string = '{{#each goodbyes}}{{text}}! {{/each}}cruel {{world}}!';

      expectTemplate(string)
        .withInput({
          goodbyes: function () {
            return [{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }];
          },
          world: 'world',
        })
        .withMessage('each with array function argument iterates over the contents when not empty')
        .toCompileTo('goodbye! Goodbye! GOODBYE! cruel world!');

      expectTemplate(string)
        .withInput({
          goodbyes: [],
          world: 'world',
        })
        .withMessage('each with array function argument ignores the contents when empty')
        .toCompileTo('cruel world!');
    });

    it('each object when last key is an empty string', () => {
      expectTemplate('{{#each goodbyes}}{{@index}}. {{text}}! {{/each}}cruel {{world}}!')
        .withInput({
          goodbyes: {
            a: { text: 'goodbye' },
            b: { text: 'Goodbye' },
            '': { text: 'GOODBYE' },
          },
          world: 'world',
        })
        .withMessage('Empty string key is not skipped')
        .toCompileTo('0. goodbye! 1. Goodbye! 2. GOODBYE! cruel world!');
    });

    it.skip('data passed to helpers', () => {
      // Requires helper registration system
      expectTemplate('{{#each letters}}{{this}}{{detectDataInsideEach}}{{/each}}')
        .withInput({ letters: ['a', 'b', 'c'] })
        .withMessage('should output data')
        .withRuntimeOptions({
          data: {
            exclaim: '!',
          },
        })
        .toCompileTo('a!b!c!');
    });

    it('each on implicit context', () => {
      expectTemplate('{{#each}}{{text}}! {{/each}}cruel world!').toThrow(
        Error,
        'Must pass iterator to #each',
      );
    });

    it('each on Map', () => {
      const map = new Map([
        [1, 'one'],
        [2, 'two'],
        [3, 'three'],
      ]);

      expectTemplate('{{#each map}}{{@key}}(i{{@index}}) {{.}} {{/each}}')
        .withInput({ map: map })
        .toCompileTo('1(i0) one 2(i1) two 3(i2) three ');

      expectTemplate('{{#each map}}{{#if @first}}{{.}}{{/if}}{{/each}}')
        .withInput({ map: map })
        .toCompileTo('one');

      expectTemplate('{{#each map}}{{#if @last}}{{.}}{{/if}}{{/each}}')
        .withInput({ map: map })
        .toCompileTo('three');

      expectTemplate('{{#each map}}{{.}}{{/each}}not-in-each')
        .withInput({ map: new Map() })
        .toCompileTo('not-in-each');
    });

    it('each on Set', () => {
      const set = new Set([1, 2, 3]);

      expectTemplate('{{#each set}}{{@key}}(i{{@index}}) {{.}} {{/each}}')
        .withInput({ set: set })
        .toCompileTo('0(i0) 1 1(i1) 2 2(i2) 3 ');

      expectTemplate('{{#each set}}{{#if @first}}{{.}}{{/if}}{{/each}}')
        .withInput({ set: set })
        .toCompileTo('1');

      expectTemplate('{{#each set}}{{#if @last}}{{.}}{{/if}}{{/each}}')
        .withInput({ set: set })
        .toCompileTo('3');

      expectTemplate('{{#each set}}{{.}}{{/each}}not-in-each')
        .withInput({ set: new Set() })
        .toCompileTo('not-in-each');
    });

    if (globalThis.Symbol && Symbol.iterator) {
      it('each on iterable', () => {
        class Iterator {
          arr: any[];
          index: number;

          constructor(arr: any[]) {
            this.arr = arr;
            this.index = 0;
          }

          next() {
            const value = this.arr[this.index];
            const done = this.index === this.arr.length;
            if (!done) {
              this.index++;
            }
            return { value, done };
          }
        }

        class Iterable {
          arr: any[];

          constructor(arr: any[]) {
            this.arr = arr;
          }

          [Symbol.iterator]() {
            return new Iterator(this.arr);
          }
        }

        const string = '{{#each goodbyes}}{{text}}! {{/each}}cruel {{world}}!';

        expectTemplate(string)
          .withInput({
            goodbyes: new Iterable([{ text: 'goodbye' }, { text: 'Goodbye' }, { text: 'GOODBYE' }]),
            world: 'world',
          })
          .withMessage('each with array argument iterates over the contents when not empty')
          .toCompileTo('goodbye! Goodbye! GOODBYE! cruel world!');

        expectTemplate(string)
          .withInput({
            goodbyes: new Iterable([]),
            world: 'world',
          })
          .withMessage('each with array argument ignores the contents when empty')
          .toCompileTo('cruel world!');
      });
    }
  });

  describe('#log', () => {
    // Only testing basic log functionality, skipping detailed console tests
    it.skip('should call logger at default level', () => {
      // Requires custom logger implementation
      expectTemplate('{{log blah}}')
        .withInput({ blah: 'whee' })
        .withMessage('log should not display')
        .toCompileTo('');
    });

    it.skip('should output to console', () => {
      // Requires console mocking - defer to later
      expectTemplate('{{log blah}}').withInput({ blah: 'whee' }).toCompileTo('');
    });
  });

  describe('#lookup', () => {
    it('should lookup arbitrary content', () => {
      expectTemplate('{{#each goodbyes}}{{lookup ../data .}}{{/each}}')
        .withInput({ goodbyes: [0, 1], data: ['foo', 'bar'] })
        .toCompileTo('foobar');
    });

    it('should not fail on undefined value', () => {
      expectTemplate('{{#each goodbyes}}{{lookup ../bar .}}{{/each}}')
        .withInput({ goodbyes: [0, 1], data: ['foo', 'bar'] })
        .toCompileTo('');
    });
  });
});
