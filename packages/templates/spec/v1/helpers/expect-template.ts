/**
 * Handlebars Test Helper Adapter
 *
 * Mimics the expectTemplate() API from Handlebars' spec/env/common.js
 * to allow running their tests against our implementation.
 *
 * Original API:
 * expectTemplate('{{foo}}')
 *   .withInput({ foo: 'bar' })
 *   .withHelper('helper', fn)
 *   .withHelpers({ helper1: fn1, helper2: fn2 })
 *   .withCompileOptions({ strict: true })
 *   .withRuntimeOptions({ data: { root: 'value' } })
 *   .withMessage('custom assertion message')
 *   .toCompileTo('bar')
 *   .toThrow(ErrorType, /pattern/)
 */

import { expect } from 'vitest';
import { compile, type Helper } from '../../../src/index.js';

interface CompileOptions {
  strict?: boolean;
  assumeObjects?: boolean;
  noEscape?: boolean;
  ignoreStandalone?: boolean;
  explicitPartialContext?: boolean;
  preventIndent?: boolean;
  compat?: boolean;
  knownHelpers?: Record<string, boolean>;
  knownHelpersOnly?: boolean;
  data?: boolean;
  [key: string]: any;
}

interface RuntimeOptions {
  data?: any;
  blockParams?: any[];
  depths?: any[];
  helpers?: Record<string, Helper>;
  partials?: Record<string, string>;
  decorators?: Record<string, any>;
  [key: string]: any;
}

export class HandlebarsTestBench {
  private templateAsString: string;
  private helpers: Record<string, Helper> = {};
  private partials: Record<string, string> = {};
  private decorators: Record<string, any> = {};
  private input: any = {};
  private message: string;
  private compileOptions: CompileOptions = {};
  private runtimeOptions: RuntimeOptions = {};

  constructor(templateAsString: string) {
    this.templateAsString = templateAsString;
    this.message = `Template "${templateAsString}" does not evaluate to expected output`;
  }

  withInput(input: any): this {
    this.input = input;
    return this;
  }

  withHelper(name: string, helperFunction: Helper): this {
    this.helpers[name] = helperFunction;
    return this;
  }

  withHelpers(helpers: Record<string, Helper>): this {
    Object.assign(this.helpers, helpers);
    return this;
  }

  withPartial(name: string, partial: string): this {
    this.partials[name] = partial;
    return this;
  }

  withPartials(partials: Record<string, string>): this {
    Object.assign(this.partials, partials);
    return this;
  }

  withDecorator(name: string, decorator: any): this {
    this.decorators[name] = decorator;
    return this;
  }

  withDecorators(decorators: Record<string, any>): this {
    Object.assign(this.decorators, decorators);
    return this;
  }

  withCompileOptions(compileOptions: CompileOptions): this {
    Object.assign(this.compileOptions, compileOptions);
    return this;
  }

  withRuntimeOptions(runtimeOptions: RuntimeOptions): this {
    Object.assign(this.runtimeOptions, runtimeOptions);
    return this;
  }

  withMessage(message: string): this {
    this.message = message;
    return this;
  }

  toCompileTo(expectedOutputAsString: string): void {
    try {
      const actualOutput = this._compileAndExecute();
      expect(actualOutput).toBe(expectedOutputAsString);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Expected')) {
        // Re-throw with custom message
        throw new Error(
          `${this.message}\nExpected: ${expectedOutputAsString}\nActual: ${(error as any).actual}`,
        );
      }
      throw error;
    }
  }

  toThrow(errorLike?: any, errMsgMatcher?: RegExp | string): void {
    expect(() => {
      this._compileAndExecute();
    }).toThrow(errMsgMatcher as any);
  }

  private _compileAndExecute(): string {
    // Check if we need partials or decorators (not supported in V1)
    if (Object.keys(this.partials).length > 0) {
      throw new Error('Partials not supported in V1');
    }
    if (Object.keys(this.decorators).length > 0) {
      throw new Error('Decorators not supported in V1');
    }

    // Compile with our implementation
    const compiled = compile(this.templateAsString);

    // Combine runtime options
    const combinedRuntimeOptions = {
      ...this.runtimeOptions,
      helpers: this.helpers,
    };

    // Execute
    return compiled.render(this.input, combinedRuntimeOptions);
  }
}

/**
 * Main entry point matching Handlebars test API
 */
export function expectTemplate(templateAsString: string): HandlebarsTestBench {
  return new HandlebarsTestBench(templateAsString);
}
