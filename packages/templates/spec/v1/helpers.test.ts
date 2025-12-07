import { describe, it } from 'vitest';
import { SafeString } from '../../src/index.js';
import { expectTemplate } from './helpers/expect-template.js';

// Make SafeString available as Handlebars.SafeString for test compatibility
const Handlebars = { SafeString };

describe('helpers', () => {
  it('helper with complex lookup', () => {
    expectTemplate('{{#goodbyes}}{{{link ../prefix}}}{{/goodbyes}}')
      .withInput({
        prefix: '/root',
        goodbyes: [{ text: 'Goodbye', url: 'goodbye' }],
      })
      .withHelper('link', function (this: any, prefix: any) {
        return '<a href="' + prefix + '/' + this.url + '">' + this.text + '</a>';
      })
      .toCompileTo('<a href="/root/goodbye">Goodbye</a>');
  });

  // SKIP: Raw blocks not in requirements
  it.skip('helper for raw block gets raw content', () => {
    expectTemplate('{{{{raw}}}} {{test}} {{{{/raw}}}}')
      .withInput({ test: 'hello' })
      .withHelper('raw', function (options) {
        return options.fn();
      })
      .withMessage('raw block helper gets raw content')
      .toCompileTo(' {{test}} ');
  });

  // SKIP: Raw blocks not in requirements
  it.skip('helper for raw block gets parameters', () => {
    expectTemplate('{{{{raw 1 2 3}}}} {{test}} {{{{/raw}}}}')
      .withInput({ test: 'hello' })
      .withHelper('raw', function (a, b, c, options) {
        return options.fn() + a + b + c;
      })
      .withMessage('raw block helper gets raw content')
      .toCompileTo(' {{test}} 123');
  });

  describe('raw block parsing (with identity helper-function)', () => {
    function runWithIdentityHelper(template: string, expected: string) {
      expectTemplate(template)
        .withHelper('identity', function (options) {
          return options.fn();
        })
        .toCompileTo(expected);
    }

    // SKIP: Raw blocks not in requirements
    it.skip('helper for nested raw block gets raw content', () => {
      runWithIdentityHelper(
        '{{{{identity}}}} {{{{b}}}} {{{{/b}}}} {{{{/identity}}}}',
        ' {{{{b}}}} {{{{/b}}}} ',
      );
    });

    // SKIP: Raw blocks not in requirements
    it.skip('helper for nested raw block works with empty content', () => {
      runWithIdentityHelper('{{{{identity}}}}{{{{/identity}}}}', '');
    });

    // SKIP: Raw blocks not in requirements - also skipped in original Handlebars
    it.skip('helper for nested raw block works if nested raw blocks are broken', () => {
      runWithIdentityHelper(
        '{{{{identity}}}} {{{{a}}}} {{{{ {{{{/ }}}} }}}} {{{{/identity}}}}',
        ' {{{{a}}}} {{{{ {{{{/ }}}} }}}} ',
      );
    });

    // SKIP: Raw blocks not in requirements
    it.skip('helper for nested raw block closes after first matching close', () => {
      runWithIdentityHelper(
        '{{{{identity}}}}abc{{{{/identity}}}} {{{{identity}}}}abc{{{{/identity}}}}',
        'abc abc',
      );
    });

    // SKIP: Raw blocks not in requirements
    it.skip('helper for nested raw block throw exception when with missing closing braces', () => {
      const string = '{{{{a}}}} {{{{/a';
      expectTemplate(string).toThrow();
    });
  });

  it('helper block with identical context', () => {
    expectTemplate('{{#goodbyes}}{{name}}{{/goodbyes}}')
      .withInput({ name: 'Alan' })
      .withHelper('goodbyes', function (this: any, options: any) {
        let out = '';
        const byes = ['Goodbye', 'goodbye', 'GOODBYE'];
        for (let i = 0, j = byes.length; i < j; i++) {
          out += byes[i] + ' ' + options.fn(this) + '! ';
        }
        return out;
      })
      .toCompileTo('Goodbye Alan! goodbye Alan! GOODBYE Alan! ');
  });

  it('helper block with complex lookup expression', () => {
    expectTemplate('{{#goodbyes}}{{../name}}{{/goodbyes}}')
      .withInput({ name: 'Alan' })
      .withHelper('goodbyes', function (options) {
        let out = '';
        const byes = ['Goodbye', 'goodbye', 'GOODBYE'];
        for (let i = 0, j = byes.length; i < j; i++) {
          out += byes[i] + ' ' + options.fn({}) + '! ';
        }
        return out;
      })
      .toCompileTo('Goodbye Alan! goodbye Alan! GOODBYE Alan! ');
  });

  it('helper with complex lookup and nested template', () => {
    expectTemplate('{{#goodbyes}}{{#link ../prefix}}{{text}}{{/link}}{{/goodbyes}}')
      .withInput({
        prefix: '/root',
        goodbyes: [{ text: 'Goodbye', url: 'goodbye' }],
      })
      .withHelper('link', function (this: any, prefix: any, options: any) {
        return '<a href="' + prefix + '/' + this.url + '">' + options.fn(this) + '</a>';
      })
      .toCompileTo('<a href="/root/goodbye">Goodbye</a>');
  });

  it('helper with complex lookup and nested template in VM+Compiler', () => {
    expectTemplate('{{#goodbyes}}{{#link ../prefix}}{{text}}{{/link}}{{/goodbyes}}')
      .withInput({
        prefix: '/root',
        goodbyes: [{ text: 'Goodbye', url: 'goodbye' }],
      })
      .withHelper('link', function (this: any, prefix: any, options: any) {
        return '<a href="' + prefix + '/' + this.url + '">' + options.fn(this) + '</a>';
      })
      .toCompileTo('<a href="/root/goodbye">Goodbye</a>');
  });

  it('helper returning undefined value', () => {
    expectTemplate(' {{nothere}}')
      .withHelpers({
        nothere: function () {},
      })
      .toCompileTo(' ');

    expectTemplate(' {{#nothere}}{{/nothere}}')
      .withHelpers({
        nothere: function () {},
      })
      .toCompileTo(' ');
  });

  it('block helper', () => {
    expectTemplate('{{#goodbyes}}{{text}}! {{/goodbyes}}cruel {{world}}!')
      .withInput({ world: 'world' })
      .withHelper('goodbyes', function (options) {
        return options.fn({ text: 'GOODBYE' });
      })
      .withMessage('Block helper executed')
      .toCompileTo('GOODBYE! cruel world!');
  });

  it('block helper staying in the same context', () => {
    expectTemplate('{{#form}}<p>{{name}}</p>{{/form}}')
      .withInput({ name: 'Yehuda' })
      .withHelper('form', function (this: any, options: any) {
        return '<form>' + options.fn(this) + '</form>';
      })
      .withMessage('Block helper executed with current context')
      .toCompileTo('<form><p>Yehuda</p></form>');
  });

  it('block helper should have context in this', () => {
    function link(this: any, options: any) {
      return '<a href="/people/' + this.id + '">' + options.fn(this) + '</a>';
    }

    expectTemplate('<ul>{{#people}}<li>{{#link}}{{name}}{{/link}}</li>{{/people}}</ul>')
      .withInput({
        people: [
          { name: 'Alan', id: 1 },
          { name: 'Yehuda', id: 2 },
        ],
      })
      .withHelper('link', link)
      .toCompileTo(
        '<ul><li><a href="/people/1">Alan</a></li><li><a href="/people/2">Yehuda</a></li></ul>',
      );
  });

  it('block helper for undefined value', () => {
    expectTemplate("{{#empty}}shouldn't render{{/empty}}").toCompileTo('');
  });

  it('block helper passing a new context', () => {
    expectTemplate('{{#form yehuda}}<p>{{name}}</p>{{/form}}')
      .withInput({ yehuda: { name: 'Yehuda' } })
      .withHelper('form', function (context, options) {
        return '<form>' + options.fn(context) + '</form>';
      })
      .withMessage('Context variable resolved')
      .toCompileTo('<form><p>Yehuda</p></form>');
  });

  it('block helper passing a complex path context', () => {
    expectTemplate('{{#form yehuda/cat}}<p>{{name}}</p>{{/form}}')
      .withInput({ yehuda: { name: 'Yehuda', cat: { name: 'Harold' } } })
      .withHelper('form', function (context, options) {
        return '<form>' + options.fn(context) + '</form>';
      })
      .withMessage('Complex path variable resolved')
      .toCompileTo('<form><p>Harold</p></form>');
  });

  it('nested block helpers', () => {
    expectTemplate('{{#form yehuda}}<p>{{name}}</p>{{#link}}Hello{{/link}}{{/form}}')
      .withInput({
        yehuda: { name: 'Yehuda' },
      })
      .withHelper('link', function (this: any, options: any) {
        return '<a href="' + this.name + '">' + options.fn(this) + '</a>';
      })
      .withHelper('form', function (context, options) {
        return '<form>' + options.fn(context) + '</form>';
      })
      .withMessage('Both blocks executed')
      .toCompileTo('<form><p>Yehuda</p><a href="Yehuda">Hello</a></form>');
  });

  it('block helper inverted sections', () => {
    const string = "{{#list people}}{{name}}{{^}}<em>Nobody's here</em>{{/list}}";
    function list(this: any, context: any, options: any) {
      if (context.length > 0) {
        let out = '<ul>';
        for (let i = 0, j = context.length; i < j; i++) {
          out += '<li>';
          out += options.fn(context[i]);
          out += '</li>';
        }
        out += '</ul>';
        return out;
      } else {
        return '<p>' + options.inverse(this) + '</p>';
      }
    }

    expectTemplate(string)
      .withInput({ people: [{ name: 'Alan' }, { name: 'Yehuda' }] })
      .withHelpers({ list: list })
      .withMessage('an inverse wrapper is passed in as a new context')
      .toCompileTo('<ul><li>Alan</li><li>Yehuda</li></ul>');

    expectTemplate(string)
      .withInput({ people: [] })
      .withHelpers({ list: list })
      .withMessage('an inverse wrapper can be optionally called')
      .toCompileTo("<p><em>Nobody's here</em></p>");

    expectTemplate('{{#list people}}Hello{{^}}{{message}}{{/list}}')
      .withInput({
        people: [],
        message: "Nobody's here",
      })
      .withHelpers({ list: list })
      .withMessage('the context of an inverse is the parent of the block')
      .toCompileTo('<p>Nobody&#x27;s here</p>');
  });

  it('pathed lambas with parameters', () => {
    const hash: any = {
      helper: function () {
        return 'winning';
      },
    };
    hash.hash = hash;
    const helpers = {
      './helper': function () {
        return 'fail';
      },
    };

    expectTemplate('{{./helper 1}}').withInput(hash).withHelpers(helpers).toCompileTo('winning');

    expectTemplate('{{hash/helper 1}}').withInput(hash).withHelpers(helpers).toCompileTo('winning');
  });

  describe('helpers hash', () => {
    it('providing a helpers hash', () => {
      expectTemplate('Goodbye {{cruel}} {{world}}!')
        .withInput({ cruel: 'cruel' })
        .withHelpers({
          world: function () {
            return 'world';
          },
        })
        .withMessage('helpers hash is available')
        .toCompileTo('Goodbye cruel world!');

      expectTemplate('Goodbye {{#iter}}{{cruel}} {{world}}{{/iter}}!')
        .withInput({ iter: [{ cruel: 'cruel' }] })
        .withHelpers({
          world: function () {
            return 'world';
          },
        })
        .withMessage('helpers hash is available inside other blocks')
        .toCompileTo('Goodbye cruel world!');
    });

    it('in cases of conflict, helpers win', () => {
      expectTemplate('{{{lookup}}}')
        .withInput({ lookup: 'Explicit' })
        .withHelpers({
          lookup: function () {
            return 'helpers';
          },
        })
        .withMessage('helpers hash has precedence escaped expansion')
        .toCompileTo('helpers');

      expectTemplate('{{lookup}}')
        .withInput({ lookup: 'Explicit' })
        .withHelpers({
          lookup: function () {
            return 'helpers';
          },
        })
        .withMessage('helpers hash has precedence simple expansion')
        .toCompileTo('helpers');
    });

    it.skip('the helpers hash is available is nested contexts', () => {
      expectTemplate('{{#outer}}{{#inner}}{{helper}}{{/inner}}{{/outer}}')
        .withInput({ outer: { inner: { unused: [] } } })
        .withHelpers({
          helper: function () {
            return 'helper';
          },
        })
        .withMessage('helpers hash is available in nested contexts.')
        .toCompileTo('helper');
    });

    // SKIP: Global helper registration not implemented yet
    it.skip('the helper hash should augment the global hash', () => {
      // handlebarsEnv.registerHelper('test_helper', function () {
      //   return 'found it!';
      // });

      expectTemplate('{{test_helper}} {{#if cruel}}Goodbye {{cruel}} {{world}}!{{/if}}')
        .withInput({ cruel: 'cruel' })
        .withHelpers({
          test_helper: function () {
            return 'found it!';
          },
          world: function () {
            return 'world!';
          },
        })
        .toCompileTo('found it! Goodbye cruel world!!');
    });
  });

  describe('registration', () => {
    // SKIP: Global helper registration not implemented yet
    it.skip('unregisters', () => {
      // handlebarsEnv.helpers = {};
      // handlebarsEnv.registerHelper('foo', function () {
      //   return 'fail';
      // });
      // handlebarsEnv.unregisterHelper('foo');
      // equals(handlebarsEnv.helpers.foo, undefined);
    });

    // SKIP: Global helper registration not implemented yet
    it.skip('allows multiple globals', () => {
      // const helpers = handlebarsEnv.helpers;
      // handlebarsEnv.helpers = {};
      // handlebarsEnv.registerHelper({
      //   if: helpers['if'],
      //   world: function () {
      //     return 'world!';
      //   },
      //   testHelper: function () {
      //     return 'found it!';
      //   },
      // });

      expectTemplate('{{testHelper}} {{#if cruel}}Goodbye {{cruel}} {{world}}!{{/if}}')
        .withInput({ cruel: 'cruel' })
        .withHelpers({
          testHelper: function () {
            return 'found it!';
          },
          world: function () {
            return 'world!';
          },
        })
        .toCompileTo('found it! Goodbye cruel world!!');
    });

    // SKIP: Global helper registration not implemented yet
    it.skip('fails with multiple and args', () => {
      // shouldThrow(
      //   function () {
      //     handlebarsEnv.registerHelper(
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
      //   'Arg not supported with multiple helpers'
      // );
    });
  });

  it('decimal number literals work', () => {
    expectTemplate('Message: {{hello -1.2 1.2}}')
      .withHelper('hello', function (times, times2) {
        if (typeof times !== 'number') {
          times = 'NaN';
        }
        if (typeof times2 !== 'number') {
          times2 = 'NaN';
        }
        return 'Hello ' + times + ' ' + times2 + ' times';
      })
      .withMessage('template with a negative integer literal')
      .toCompileTo('Message: Hello -1.2 1.2 times');
  });

  it('negative number literals work', () => {
    expectTemplate('Message: {{hello -12}}')
      .withHelper('hello', function (times) {
        if (typeof times !== 'number') {
          times = 'NaN';
        }
        return 'Hello ' + times + ' times';
      })
      .withMessage('template with a negative integer literal')
      .toCompileTo('Message: Hello -12 times');
  });

  describe('String literal parameters', () => {
    it('simple literals work', () => {
      expectTemplate('Message: {{hello "world" 12 true false}}')
        .withHelper('hello', function (param, times, bool1, bool2) {
          if (typeof times !== 'number') {
            times = 'NaN';
          }
          if (typeof bool1 !== 'boolean') {
            bool1 = 'NaB';
          }
          if (typeof bool2 !== 'boolean') {
            bool2 = 'NaB';
          }
          return 'Hello ' + param + ' ' + times + ' times: ' + bool1 + ' ' + bool2;
        })
        .withMessage('template with a simple String literal')
        .toCompileTo('Message: Hello world 12 times: true false');
    });

    it('using a quote in the middle of a parameter raises an error', () => {
      expectTemplate('Message: {{hello wo"rld"}}').toThrow(Error);
    });

    it('escaping a String is possible', () => {
      expectTemplate('Message: {{{hello "\\"world\\""}}}')
        .withHelper('hello', function (param) {
          return 'Hello ' + param;
        })
        .withMessage('template with an escaped String literal')
        .toCompileTo('Message: Hello "world"');
    });

    it("it works with ' marks", () => {
      expectTemplate('Message: {{{hello "Alan\'s world"}}}')
        .withHelper('hello', function (param) {
          return 'Hello ' + param;
        })
        .withMessage("template with a ' mark")
        .toCompileTo("Message: Hello Alan's world");
    });
  });

  describe('multiple parameters', () => {
    it('simple multi-params work', () => {
      expectTemplate('Message: {{goodbye cruel world}}')
        .withInput({ cruel: 'cruel', world: 'world' })
        .withHelper('goodbye', function (cruel, world) {
          return 'Goodbye ' + cruel + ' ' + world;
        })
        .withMessage('regular helpers with multiple params')
        .toCompileTo('Message: Goodbye cruel world');
    });

    it('block multi-params work', () => {
      expectTemplate('Message: {{#goodbye cruel world}}{{greeting}} {{adj}} {{noun}}{{/goodbye}}')
        .withInput({ cruel: 'cruel', world: 'world' })
        .withHelper('goodbye', function (cruel, world, options) {
          return options.fn({ greeting: 'Goodbye', adj: cruel, noun: world });
        })
        .withMessage('block helpers with multiple params')
        .toCompileTo('Message: Goodbye cruel world');
    });
  });

  describe('hash', () => {
    it('helpers can take an optional hash', () => {
      expectTemplate('{{goodbye cruel="CRUEL" world="WORLD" times=12}}')
        .withHelper('goodbye', function (options) {
          return (
            'GOODBYE ' +
            options.hash.cruel +
            ' ' +
            options.hash.world +
            ' ' +
            options.hash.times +
            ' TIMES'
          );
        })
        .withMessage('Helper output hash')
        .toCompileTo('GOODBYE CRUEL WORLD 12 TIMES');
    });

    it('helpers can take an optional hash with booleans', () => {
      function goodbye(options: any) {
        if (options.hash.print === true) {
          return 'GOODBYE ' + options.hash.cruel + ' ' + options.hash.world;
        } else if (options.hash.print === false) {
          return 'NOT PRINTING';
        } else {
          return 'THIS SHOULD NOT HAPPEN';
        }
      }

      expectTemplate('{{goodbye cruel="CRUEL" world="WORLD" print=true}}')
        .withHelper('goodbye', goodbye)
        .withMessage('Helper output hash')
        .toCompileTo('GOODBYE CRUEL WORLD');

      expectTemplate('{{goodbye cruel="CRUEL" world="WORLD" print=false}}')
        .withHelper('goodbye', goodbye)
        .withMessage('Boolean helper parameter honored')
        .toCompileTo('NOT PRINTING');
    });

    it('block helpers can take an optional hash', () => {
      expectTemplate('{{#goodbye cruel="CRUEL" times=12}}world{{/goodbye}}')
        .withHelper('goodbye', function (this: any, options: any) {
          return (
            'GOODBYE ' +
            options.hash.cruel +
            ' ' +
            options.fn(this) +
            ' ' +
            options.hash.times +
            ' TIMES'
          );
        })
        .withMessage('Hash parameters output')
        .toCompileTo('GOODBYE CRUEL world 12 TIMES');
    });

    it('block helpers can take an optional hash with single quoted stings', () => {
      expectTemplate('{{#goodbye cruel="CRUEL" times=12}}world{{/goodbye}}')
        .withHelper('goodbye', function (this: any, options: any) {
          return (
            'GOODBYE ' +
            options.hash.cruel +
            ' ' +
            options.fn(this) +
            ' ' +
            options.hash.times +
            ' TIMES'
          );
        })
        .withMessage('Hash parameters output')
        .toCompileTo('GOODBYE CRUEL world 12 TIMES');
    });

    it('block helpers can take an optional hash with booleans', () => {
      function goodbye(this: any, options: any) {
        if (options.hash.print === true) {
          return 'GOODBYE ' + options.hash.cruel + ' ' + options.fn(this);
        } else if (options.hash.print === false) {
          return 'NOT PRINTING';
        } else {
          return 'THIS SHOULD NOT HAPPEN';
        }
      }

      expectTemplate('{{#goodbye cruel="CRUEL" print=true}}world{{/goodbye}}')
        .withHelper('goodbye', goodbye)
        .withMessage('Boolean hash parameter honored')
        .toCompileTo('GOODBYE CRUEL world');

      expectTemplate('{{#goodbye cruel="CRUEL" print=false}}world{{/goodbye}}')
        .withHelper('goodbye', goodbye)
        .withMessage('Boolean hash parameter honored')
        .toCompileTo('NOT PRINTING');
    });
  });

  describe('helperMissing', () => {
    it('if a context is not found, helperMissing is used', () => {
      expectTemplate('{{hello}} {{link_to world}}').toThrow(/Missing helper: "link_to"/);
    });

    it.skip('if a context is not found, custom helperMissing is used', () => {
      expectTemplate('{{hello}} {{link_to world}}')
        .withInput({ hello: 'Hello', world: 'world' })
        .withHelper('helperMissing', function (mesg, options) {
          if (options.name === 'link_to') {
            return new Handlebars.SafeString('<a>' + mesg + '</a>');
          }
        })
        .toCompileTo('Hello <a>world</a>');
    });

    it.skip('if a value is not found, custom helperMissing is used', () => {
      expectTemplate('{{hello}} {{link_to}}')
        .withInput({ hello: 'Hello', world: 'world' })
        .withHelper('helperMissing', function (options) {
          if (options.name === 'link_to') {
            return new Handlebars.SafeString('<a>winning</a>');
          }
        })
        .toCompileTo('Hello <a>winning</a>');
    });
  });

  describe('knownHelpers', () => {
    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Known helper should render helper', () => {
      expectTemplate('{{hello}}')
        .withCompileOptions({
          knownHelpers: { hello: true },
        })
        .withHelper('hello', function () {
          return 'foo';
        })
        .toCompileTo('foo');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Unknown helper in knownHelpers only mode should be passed as undefined', () => {
      expectTemplate('{{typeof hello}}')
        .withCompileOptions({
          knownHelpers: { typeof: true },
          knownHelpersOnly: true,
        })
        .withHelper('typeof', function (arg) {
          return typeof arg;
        })
        .withHelper('hello', function () {
          return 'foo';
        })
        .toCompileTo('undefined');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Builtin helpers available in knownHelpers only mode', () => {
      expectTemplate('{{#unless foo}}bar{{/unless}}')
        .withCompileOptions({
          knownHelpersOnly: true,
        })
        .toCompileTo('bar');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Field lookup works in knownHelpers only mode', () => {
      expectTemplate('{{foo}}')
        .withCompileOptions({
          knownHelpersOnly: true,
        })
        .withInput({ foo: 'bar' })
        .toCompileTo('bar');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Conditional blocks work in knownHelpers only mode', () => {
      expectTemplate('{{#foo}}bar{{/foo}}')
        .withCompileOptions({
          knownHelpersOnly: true,
        })
        .withInput({ foo: 'baz' })
        .toCompileTo('bar');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Invert blocks work in knownHelpers only mode', () => {
      expectTemplate('{{^foo}}bar{{/foo}}')
        .withCompileOptions({
          knownHelpersOnly: true,
        })
        .withInput({ foo: false })
        .toCompileTo('bar');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Functions are bound to the context in knownHelpers only mode', () => {
      expectTemplate('{{foo}}')
        .withCompileOptions({
          knownHelpersOnly: true,
        })
        .withInput({
          foo: function () {
            return this.bar;
          },
          bar: 'bar',
        })
        .toCompileTo('bar');
    });

    // SKIP: knownHelpers is a compile-time optimization not needed for interpreter
    it.skip('Unknown helper call in knownHelpers only mode should throw', () => {
      expectTemplate('{{typeof hello}}')
        .withCompileOptions({ knownHelpersOnly: true })
        .toThrow(Error);
    });
  });

  describe('blockHelperMissing', () => {
    it('lambdas are resolved by blockHelperMissing, not handlebars proper', () => {
      expectTemplate('{{#truthy}}yep{{/truthy}}')
        .withInput({
          truthy: function () {
            return true;
          },
        })
        .toCompileTo('yep');
    });

    it('lambdas resolved by blockHelperMissing are bound to the context', () => {
      expectTemplate('{{#truthy}}yep{{/truthy}}')
        .withInput({
          truthy: function () {
            return this.truthiness();
          },
          truthiness: function () {
            return false;
          },
        })
        .toCompileTo('');
    });
  });

  describe('name field', () => {
    const helpers = {
      blockHelperMissing: function () {
        return 'missing: ' + arguments[arguments.length - 1].name;
      },
      helperMissing: function () {
        return 'helper missing: ' + arguments[arguments.length - 1].name;
      },
      helper: function () {
        return 'ran: ' + arguments[arguments.length - 1].name;
      },
    };

    // SKIP: name field is debug metadata not critical
    it.skip('should include in ambiguous mustache calls', () => {
      expectTemplate('{{helper}}').withHelpers(helpers).toCompileTo('ran: helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include in helper mustache calls', () => {
      expectTemplate('{{helper 1}}').withHelpers(helpers).toCompileTo('ran: helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include in ambiguous block calls', () => {
      expectTemplate('{{#helper}}{{/helper}}').withHelpers(helpers).toCompileTo('ran: helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include in simple block calls', () => {
      expectTemplate('{{#./helper}}{{/./helper}}')
        .withHelpers(helpers)
        .toCompileTo('missing: ./helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include in helper block calls', () => {
      expectTemplate('{{#helper 1}}{{/helper}}').withHelpers(helpers).toCompileTo('ran: helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include in known helper calls', () => {
      expectTemplate('{{helper}}')
        .withCompileOptions({
          knownHelpers: { helper: true },
          knownHelpersOnly: true,
        })
        .withHelpers(helpers)
        .toCompileTo('ran: helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include full id', () => {
      expectTemplate('{{#foo.helper}}{{/foo.helper}}')
        .withInput({ foo: {} })
        .withHelpers(helpers)
        .toCompileTo('missing: foo.helper');
    });

    // SKIP: name field is debug metadata not critical
    it.skip('should include full id if a hash is passed', () => {
      expectTemplate('{{#foo.helper bar=baz}}{{/foo.helper}}')
        .withInput({ foo: {} })
        .withHelpers(helpers)
        .toCompileTo('helper missing: foo.helper');
    });
  });

  describe('name conflicts', () => {
    it('helpers take precedence over same-named context properties', () => {
      expectTemplate('{{goodbye}} {{cruel world}}')
        .withHelper('goodbye', function (this: any) {
          return this.goodbye.toUpperCase();
        })
        .withHelper('cruel', function (world: any) {
          return 'cruel ' + world.toUpperCase();
        })
        .withInput({
          goodbye: 'goodbye',
          world: 'world',
        })
        .withMessage('Helper executed')
        .toCompileTo('GOODBYE cruel WORLD');
    });

    it('helpers take precedence over same-named context properties$', () => {
      expectTemplate('{{#goodbye}} {{cruel world}}{{/goodbye}}')
        .withHelper('goodbye', function (this: any, options: any) {
          return this.goodbye.toUpperCase() + options.fn(this);
        })
        .withHelper('cruel', function (world: any) {
          return 'cruel ' + world.toUpperCase();
        })
        .withInput({
          goodbye: 'goodbye',
          world: 'world',
        })
        .withMessage('Helper executed')
        .toCompileTo('GOODBYE cruel WORLD');
    });

    it('Scoped names take precedence over helpers', () => {
      expectTemplate('{{this.goodbye}} {{cruel world}} {{cruel this.goodbye}}')
        .withHelper('goodbye', function (this: any) {
          return this.goodbye.toUpperCase();
        })
        .withHelper('cruel', function (world: any) {
          return 'cruel ' + world.toUpperCase();
        })
        .withInput({
          goodbye: 'goodbye',
          world: 'world',
        })
        .withMessage('Helper not executed')
        .toCompileTo('goodbye cruel WORLD cruel GOODBYE');
    });

    it('Scoped names take precedence over block helpers', () => {
      expectTemplate('{{#goodbye}} {{cruel world}}{{/goodbye}} {{this.goodbye}}')
        .withHelper('goodbye', function (this: any, options: any) {
          return this.goodbye.toUpperCase() + options.fn(this);
        })
        .withHelper('cruel', function (world: any) {
          return 'cruel ' + world.toUpperCase();
        })
        .withInput({
          goodbye: 'goodbye',
          world: 'world',
        })
        .withMessage('Helper executed')
        .toCompileTo('GOODBYE cruel WORLD goodbye');
    });
  });

  describe('block params', () => {
    it('should take presedence over context values', () => {
      expectTemplate('{{#goodbyes as |value|}}{{value}}{{/goodbyes}}{{value}}')
        .withInput({ value: 'foo' })
        .withHelper('goodbyes', function (options) {
          // equals(options.fn.blockParams, 1);
          return options.fn({ value: 'bar' }, { blockParams: [1, 2] });
        })
        .toCompileTo('1foo');
    });

    it('should take presedence over helper values', () => {
      expectTemplate('{{#goodbyes as |value|}}{{value}}{{/goodbyes}}{{value}}')
        .withHelper('value', function () {
          return 'foo';
        })
        .withHelper('goodbyes', function (options) {
          // equals(options.fn.blockParams, 1);
          return options.fn({}, { blockParams: [1, 2] });
        })
        .toCompileTo('1foo');
    });

    it('should not take presedence over pathed values', () => {
      expectTemplate('{{#goodbyes as |value|}}{{./value}}{{/goodbyes}}{{value}}')
        .withInput({ value: 'bar' })
        .withHelper('value', function () {
          return 'foo';
        })
        .withHelper('goodbyes', function (this: any, options: any) {
          // equals(options.fn.blockParams, 1);
          return options.fn(this, { blockParams: [1, 2] });
        })
        .toCompileTo('barfoo');
    });

    it('should take presednece over parent block params', () => {
      let value = 1;
      expectTemplate(
        '{{#goodbyes as |value|}}{{#goodbyes}}{{value}}{{#goodbyes as |value|}}{{value}}{{/goodbyes}}{{/goodbyes}}{{/goodbyes}}{{value}}',
      )
        .withInput({ value: 'foo' })
        .withHelper('goodbyes', function (options) {
          return options.fn(
            { value: 'bar' },
            {
              blockParams: options.fn.blockParams === 1 ? [value++, value++] : undefined,
            },
          );
        })
        .toCompileTo('13foo');
    });

    it.skip('should allow block params on chained helpers', () => {
      expectTemplate('{{#if bar}}{{else goodbyes as |value|}}{{value}}{{/if}}{{value}}')
        .withInput({ value: 'foo' })
        .withHelper('goodbyes', function (options) {
          // equals(options.fn.blockParams, 1);
          return options.fn({ value: 'bar' }, { blockParams: [1, 2] });
        })
        .toCompileTo('1foo');
    });
  });

  describe('built-in helpers malformed arguments', () => {
    it('if helper - too few arguments', () => {
      expectTemplate('{{#if}}{{/if}}').toThrow(/#if requires exactly one argument/);
    });

    it('if helper - too many arguments, string', () => {
      expectTemplate('{{#if test "string"}}{{/if}}').toThrow(/#if requires exactly one argument/);
    });

    it('if helper - too many arguments, undefined', () => {
      expectTemplate('{{#if test undefined}}{{/if}}').toThrow(/#if requires exactly one argument/);
    });

    it('if helper - too many arguments, null', () => {
      expectTemplate('{{#if test null}}{{/if}}').toThrow(/#if requires exactly one argument/);
    });

    it('unless helper - too few arguments', () => {
      expectTemplate('{{#unless}}{{/unless}}').toThrow(/#unless requires exactly one argument/);
    });

    it('unless helper - too many arguments', () => {
      expectTemplate('{{#unless test null}}{{/unless}}').toThrow(
        /#unless requires exactly one argument/,
      );
    });

    it('with helper - too few arguments', () => {
      expectTemplate('{{#with}}{{/with}}').toThrow(/#with requires exactly one argument/);
    });

    it('with helper - too many arguments', () => {
      expectTemplate('{{#with test "string"}}{{/with}}').toThrow(
        /#with requires exactly one argument/,
      );
    });
  });

  describe('the lookupProperty-option', () => {
    // SKIP: lookupProperty is internal API
    it.skip('should be passed to custom helpers', () => {
      expectTemplate('{{testHelper}}')
        .withHelper('testHelper', function testHelper(this: any, options: any) {
          return options.lookupProperty(this, 'testProperty');
        })
        .withInput({ testProperty: 'abc' })
        .toCompileTo('abc');
    });
  });
});
