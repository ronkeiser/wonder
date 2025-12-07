import { describe, it } from 'vitest';
import { expectTemplate } from './helpers/expect-template.js';

describe('data', () => {
  it.skip('passing in data to a compiled function that expects data - works with helpers', () => {
    // Requires helper registration system
    expectTemplate('{{hello}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, options: any) {
        return options.data.adjective + ' ' + this.noun;
      })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withInput({ noun: 'cat' })
      .withMessage('Data output by helper')
      .toCompileTo('happy cat');
  });

  it('data can be looked up via @foo', () => {
    expectTemplate('{{@hello}}')
      .withRuntimeOptions({ data: { hello: 'hello' } })
      .withMessage('@foo retrieves template data')
      .toCompileTo('hello');
  });

  it.skip('deep @foo triggers automatic top-level data', () => {
    // Requires helper registration and frame creation
    expectTemplate(
      '{{#let world="world"}}{{#if foo}}{{#if foo}}Hello {{@world}}{{/if}}{{/if}}{{/let}}',
    )
      .withInput({ foo: true })
      .withMessage('Automatic data was triggered')
      .toCompileTo('Hello world');
  });

  it.skip('parameter data can be looked up via @foo', () => {
    // Requires helper registration
    expectTemplate('{{hello @world}}')
      .withRuntimeOptions({ data: { world: 'world' } })
      .withHelper('hello', function (noun: any) {
        return 'Hello ' + noun;
      })
      .withMessage('@foo as a parameter retrieves template data')
      .toCompileTo('Hello world');
  });

  it.skip('hash values can be looked up via @foo', () => {
    // Requires helper registration
    expectTemplate('{{hello noun=@world}}')
      .withRuntimeOptions({ data: { world: 'world' } })
      .withHelper('hello', function (options: any) {
        return 'Hello ' + options.hash.noun;
      })
      .withMessage('@foo as a parameter retrieves template data')
      .toCompileTo('Hello world');
  });

  it.skip('nested parameter data can be looked up via @foo.bar', () => {
    // Requires helper registration
    expectTemplate('{{hello @world.bar}}')
      .withRuntimeOptions({ data: { world: { bar: 'world' } } })
      .withHelper('hello', function (noun: any) {
        return 'Hello ' + noun;
      })
      .withMessage('@foo as a parameter retrieves template data')
      .toCompileTo('Hello world');
  });

  it.skip('nested parameter data does not fail with @world.bar', () => {
    // Requires helper registration
    expectTemplate('{{hello @world.bar}}')
      .withRuntimeOptions({ data: { foo: { bar: 'world' } } })
      .withHelper('hello', function (noun: any) {
        return 'Hello ' + noun;
      })
      .withMessage('@foo as a parameter retrieves template data')
      .toCompileTo('Hello undefined');
  });

  it('parameter data throws when using complex scope references', () => {
    expectTemplate('{{#goodbyes}}{{text}} cruel {{@foo/../name}}! {{/goodbyes}}').toThrow(Error);
  });

  it('data can be functions', () => {
    expectTemplate('{{@hello}}')
      .withRuntimeOptions({
        data: {
          hello: function () {
            return 'hello';
          },
        },
      })
      .toCompileTo('hello');
  });

  it('data can be functions with params', () => {
    expectTemplate('{{@hello "hello"}}')
      .withRuntimeOptions({
        data: {
          hello: function (arg: any) {
            return arg;
          },
        },
      })
      .toCompileTo('hello');
  });

  it.skip('data is inherited downstream', () => {
    // Requires helper registration and frame creation
    expectTemplate(
      '{{#let foo=1 bar=2}}{{#let foo=bar.baz}}{{@bar}}{{@foo}}{{/let}}{{@foo}}{{/let}}',
    )
      .withInput({ bar: { baz: 'hello world' } })
      .withCompileOptions({ data: true })
      .withRuntimeOptions({ data: {} })
      .withMessage('data variables are inherited downstream')
      .toCompileTo('2hello world1');
  });

  it.skip('passing in data to a compiled function that expects data - works with helpers in partials', () => {
    // Requires partials and helper registration
    expectTemplate('{{>myPartial}}')
      .withCompileOptions({ data: true })
      .withPartial('myPartial', '{{hello}}')
      .withHelper('hello', function (this: any, options: any) {
        return options.data.adjective + ' ' + this.noun;
      })
      .withInput({ noun: 'cat' })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Data output by helper inside partial')
      .toCompileTo('happy cat');
  });

  it.skip('passing in data to a compiled function that expects data - works with helpers and parameters', () => {
    // Requires helper registration
    expectTemplate('{{hello world}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, noun: any, options: any) {
        return options.data.adjective + ' ' + noun + (this.exclaim ? '!' : '');
      })
      .withInput({ exclaim: true, world: 'world' })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Data output by helper')
      .toCompileTo('happy world!');
  });

  it.skip('passing in data to a compiled function that expects data - works with block helpers', () => {
    // Requires helper registration
    expectTemplate('{{#hello}}{{world}}{{/hello}}')
      .withCompileOptions({
        data: true,
      })
      .withHelper('hello', function (this: any, options: any) {
        return options.fn(this);
      })
      .withHelper('world', function (this: any, options: any) {
        return options.data.adjective + ' world' + (this.exclaim ? '!' : '');
      })
      .withInput({ exclaim: true })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Data output by helper')
      .toCompileTo('happy world!');
  });

  it.skip('passing in data to a compiled function that expects data - works with block helpers that use ..', () => {
    // Requires helper registration
    expectTemplate('{{#hello}}{{world ../zomg}}{{/hello}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, options: any) {
        return options.fn({ exclaim: '?' });
      })
      .withHelper('world', function (this: any, thing: any, options: any) {
        return options.data.adjective + ' ' + thing + (this.exclaim || '');
      })
      .withInput({ exclaim: true, zomg: 'world' })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Data output by helper')
      .toCompileTo('happy world?');
  });

  it.skip('passing in data to a compiled function that expects data - data is passed to with block helpers where children use ..', () => {
    // Requires helper registration
    expectTemplate('{{#hello}}{{world ../zomg}}{{/hello}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, options: any) {
        return options.data.accessData + ' ' + options.fn({ exclaim: '?' });
      })
      .withHelper('world', function (this: any, thing: any, options: any) {
        return options.data.adjective + ' ' + thing + (this.exclaim || '');
      })
      .withInput({ exclaim: true, zomg: 'world' })
      .withRuntimeOptions({ data: { adjective: 'happy', accessData: '#win' } })
      .withMessage('Data output by helper')
      .toCompileTo('#win happy world?');
  });

  it.skip('you can override inherited data when invoking a helper', () => {
    // Requires helper registration
    expectTemplate('{{#hello}}{{world zomg}}{{/hello}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, options: any) {
        return options.fn({ exclaim: '?', zomg: 'world' }, { data: { adjective: 'sad' } });
      })
      .withHelper('world', function (this: any, thing: any, options: any) {
        return options.data.adjective + ' ' + thing + (this.exclaim || '');
      })
      .withInput({ exclaim: true, zomg: 'planet' })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Overridden data output by helper')
      .toCompileTo('sad world?');
  });

  it.skip('you can override inherited data when invoking a helper with depth', () => {
    // Requires helper registration
    expectTemplate('{{#hello}}{{world ../zomg}}{{/hello}}')
      .withCompileOptions({ data: true })
      .withHelper('hello', function (this: any, options: any) {
        return options.fn({ exclaim: '?' }, { data: { adjective: 'sad' } });
      })
      .withHelper('world', function (this: any, thing: any, options: any) {
        return options.data.adjective + ' ' + thing + (this.exclaim || '');
      })
      .withInput({ exclaim: true, zomg: 'world' })
      .withRuntimeOptions({ data: { adjective: 'happy' } })
      .withMessage('Overridden data output by helper')
      .toCompileTo('sad world?');
  });

  describe('@root', () => {
    it('the root context can be looked up via @root', () => {
      expectTemplate('{{@root.foo}}')
        .withInput({ foo: 'hello' })
        .withRuntimeOptions({ data: {} })
        .toCompileTo('hello');

      expectTemplate('{{@root.foo}}').withInput({ foo: 'hello' }).toCompileTo('hello');
    });

    it('passed root values take priority', () => {
      expectTemplate('{{@root.foo}}')
        .withInput({ foo: 'should not be used' })
        .withRuntimeOptions({ data: { root: { foo: 'hello' } } })
        .toCompileTo('hello');
    });
  });

  describe('nesting', () => {
    it.skip('the root context can be looked up via @root', () => {
      // Requires helper registration and frame creation
      expectTemplate(
        '{{#helper}}{{#helper}}{{@./depth}} {{@../depth}} {{@../../depth}}{{/helper}}{{/helper}}',
      )
        .withInput({ foo: 'hello' })
        .withRuntimeOptions({
          data: {
            depth: 0,
          },
        })
        .toCompileTo('2 1 0');
    });
  });
});
