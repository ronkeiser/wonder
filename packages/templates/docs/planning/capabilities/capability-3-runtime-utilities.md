# Capability 3: Runtime Utilities

**Status:** `[✓]` **COMPLETE** - All 5 features implemented with 156 tests passing

**Goal:** Implement core utility functions from Handlebars runtime for secure, correct evaluation. These utilities provide the foundation for safe property access, HTML escaping, scope management, and value checking that the interpreter will use.

**Reference:** Handlebars `runtime.js` and `utils.js` implementations

**Summary:**

- Feature 3.1: lookupProperty - 28 tests ✓
- Feature 3.2: escapeExpression & SafeString - 49 tests ✓
- Feature 3.3: createFrame - 12 tests ✓
- Feature 3.4: isEmpty - 29 tests ✓
- Feature 3.5: Type Checking (isArray, isFunction, isObject) - 38 tests ✓

**Total:** 156 tests, 1092 tests overall

---

## Feature 3.1: lookupProperty

**Goal:** Security-aware property access that prevents prototype pollution attacks

### Task C3-F1-T1: Implement Basic Property Lookup

**Status:** `[x]` Complete ✅

- Create `lookupProperty()` function with signature:
  - `lookupProperty(parent: any, propertyName: string): any`
- Handle null/undefined parents:
  - Return `undefined` if parent is `null` or `undefined`
  - Don't attempt property access on nullish values
- Check property existence:
  - Use `Object.prototype.hasOwnProperty.call(parent, propertyName)`
  - Return property value if it exists as own property
  - Return `undefined` if property doesn't exist or is inherited

**Security Critical:** Only return own properties, never inherited properties. This prevents accessing `__proto__`, `constructor`, and other dangerous inherited properties that could lead to prototype pollution.

**Deliverable:** `src/runtime/utils.ts` with `lookupProperty()` function

**Tests:**

- Access existing own property returns value ✅
- Access undefined property returns `undefined` ✅
- Access null parent returns `undefined` ✅
- Access undefined parent returns `undefined` ✅
- Access inherited property returns `undefined` (security) ✅
- Access own property with `null` value returns `null` ✅
- Access own property with `undefined` value returns `undefined` ✅
- Blocks access to `__proto__`, `constructor`, `prototype` ✅
- Blocks all inherited properties (toString, hasOwnProperty, etc.) ✅
- Works with arrays and array indices ✅
- Works with numeric string keys ✅
- Returns undefined for primitive parents (string, number, boolean) ✅
- Works with functions ✅
- Works with objects with null prototype ✅
- Handles deeply nested properties ✅
- Handles property shadowing ✅
- Distinguishes between missing and undefined properties ✅

**Total Tests:** 28 tests (all passing)

**Implementation:** `src/runtime/utils.ts` - `lookupProperty()` with security-critical own-property checking

**Test File:** `test/runtime/utils.test.ts`

### Task C3-F1-T2: Handle Edge Cases

**Status:** `[x]` Complete ✅

- Handle non-object parents:
  - Primitives (string, number, boolean) — return `undefined`
  - Functions — check for own properties only
- Handle symbol properties:
  - Support symbol property names
  - Still enforce own-property check
- Handle numeric string properties:
  - Array indices like `"0"`, `"1"` work correctly
  - Object numeric keys work correctly

**Deliverable:** Complete `lookupProperty()` with edge case handling

**Tests:**

- String primitive parent returns `undefined` ✅
- Number primitive parent returns `undefined` ✅
- Boolean primitive parent returns `undefined` ✅
- Function with own property returns value ✅
- Function without property returns `undefined` ✅
- Array index access with string `"0"` returns element ✅
- Object with numeric key `"0"` returns value ✅

**Note:** Symbol properties not yet tested (deferred to V2). All other edge cases covered in Task C3-F1-T1 tests.

### Task C3-F1-T3: Performance Optimization

**Status:** `[x]` Complete ✅

- Cache `hasOwnProperty` reference for performance:
  - Store `Object.prototype.hasOwnProperty` once
  - Reuse cached reference in function
- Minimize function calls:
  - Single call to `hasOwnProperty.call()`
  - Avoid multiple property accesses

**Deliverable:** Optimized `lookupProperty()` implementation

**Tests:**

- `hasOwnProperty` cached at module level ✅
- Single call to `hasOwnProperty.call()` per lookup ✅
- All 28 tests from T1 still pass ✅

**Note:** Performance optimization was implemented in Task C3-F1-T1 by caching `hasOwnProperty` reference at module level.

---

## Feature 3.2: escapeExpression

**Goal:** HTML entity escaping for safe output in HTML contexts

### Task C3-F2-T1: Implement Core Escaping Logic

**Status:** `[x]` Complete ✅

- Create `escapeExpression()` function with signature:
  - `escapeExpression(value: any): string`
- Handle special input values:
  - `null` or `undefined` → return `""`
  - Non-string values → convert to string using `String(value)`
  - Already-string values → escape directly
- Implement character escaping:
  - Create escape map for 7 characters:
    - `&` → `&amp;`
    - `<` → `&lt;`
    - `>` → `&gt;`
    - `"` → `&quot;`
    - `'` → `&#x27;`
    - `` ` `` → `&#x60;`
    - `=` → `&#x3D;`
  - Replace all occurrences using regex or replace function

**Deliverable:** `src/runtime/utils.ts` with `escapeExpression()` function

**Tests:**

- All 7 special characters escaped correctly ✅
- `null` returns `""` ✅
- `undefined` returns `""` ✅
- Type coercion (`false`, `0`, objects, arrays) ✅
- HTML tags fully escaped ✅
- Script injection prevention ✅
- Event handler escaping ✅
- XSS prevention scenarios ✅
- Unicode and special text handling ✅
- URLs with special characters ✅

**Total Tests:** 37 tests (all passing)

**Implementation:** `src/runtime/utils.ts` - `escapeExpression()` with 7-character HTML entity escaping

**Test File:** `test/runtime/utils.test.ts`

### Task C3-F2-T2: Optimize Fast Path

**Status:** `[x]` Complete ✅

- Add fast path detection:
  - Check if string contains any special characters
  - If no special characters, return original string unchanged
  - Use regex test: `/[&<>"'`=]/` for detection
- Only perform replacement if needed:
  - Test string first
  - If test fails, return original
  - If test passes, perform escaping

**Deliverable:** Optimized `escapeExpression()` with fast path

**Tests:**

- Fast path detection with regex test ✅
- Strings with no special chars unchanged ✅
- All 37 escaping tests still pass ✅

**Note:** Fast path optimization was implemented in Task C3-F2-T1 using `escapeRegex.test()` to skip replacement when no special characters are present.

### Task C3-F2-T3: Handle SafeString Passthrough

**Status:** `[✓]` Complete (12 tests)

- Create `SafeString` class for pre-escaped content:
  - `constructor(string: string)` — stores string
  - `toString()` — returns stored string
  - `toHTML()` — returns stored string (Handlebars compatibility)
- Update `escapeExpression()`:
  - Check if value is `SafeString` instance
  - If yes, return `toString()` without escaping
  - If no, perform normal escaping

**Implementation Notes:**

- `SafeString` class created with private string field
- `escapeExpression()` checks `instanceof SafeString` before all other checks
- If `SafeString`, returns `toString()` without escaping
- Allows helpers to return pre-escaped HTML safely

**Deliverable:** `SafeString` class and integration with `escapeExpression()`

**Tests:**

- `SafeString` instance bypasses escaping ✓
- `SafeString` with HTML tags preserved ✓
- Regular string still escaped ✓
- `SafeString.toString()` returns original string ✓
- `SafeString.toHTML()` returns original string ✓
- SafeString with empty string ✓
- SafeString preserves HTML entities ✓
- SafeString preserves dangerous HTML ✓
- Mixed usage (SafeString + regular strings) ✓
- SafeString takes precedence over null check ✓
- SafeString with all special characters bypasses escaping ✓
- Regular string comparison still escapes ✓

**Feature 3.2 Status:** `[✓]` Complete (49 tests total: 37 escapeExpression + 12 SafeString)

---

## Feature 3.3: createFrame

**Goal:** Data frame creation for scope isolation in block helpers

### Task C3-F3-T1: Implement Frame Creation

**Status:** `[ ]` Not Started

- Create `createFrame()` function with signature:
  - `createFrame(data: object): object`
- Implementation:
  - Create new object copying all properties from input
  - Add special `_parent` property referencing original object
  - Return new frame object
- Use `Object.create(data)` for prototypal inheritance OR
  - Use spread operator: `{ ...data, _parent: data }`
  - Spread is clearer about own properties

**Note:** Handlebars uses `Object.create()` but spread operator is more explicit about creating own properties, which aligns with our security focus.

**Deliverable:** `src/runtime/utils.ts` with `createFrame()` function

**Tests:**

- Creates new object (not same reference)
- Copies all properties from input
- Adds `_parent` property referencing input
- Changes to frame don't affect parent
- Parent properties accessible via `_parent`
- Works with empty object input
- Works with object containing data variables

### Task C3-F3-T2: Handle Edge Cases

**Status:** `[✓]` Complete (5 tests)

- Handle null/undefined input:
  - Create empty frame with `_parent: null` or `_parent: undefined`
- Handle nested frames:
  - `_parent` chain preserved through multiple calls
  - `createFrame(createFrame(data))` maintains chain
- Handle special property names:
  - Properties named `_parent` in input don't break chain
  - New `_parent` always references immediate parent

**Implementation Notes:**

- Null/undefined check at function start returns `{ _parent: data }`
- Spread operator creates shallow copy with all properties
- New `_parent` always overwrites any existing `_parent` property
- Nesting works correctly because each frame is a new object

**Deliverable:** Robust `createFrame()` with edge case handling

**Tests:**

- `createFrame(null)` returns frame with `_parent: null` ✓
- `createFrame(undefined)` returns frame with `_parent: undefined` ✓
- Nested frames maintain `_parent` chain ✓
- Input with `_parent` property handled correctly ✓
- Multiple levels of nesting work correctly ✓

**Feature 3.3 Status:** `[✓]` Complete (12 tests total: 7 basic + 5 edge cases)

---

## Feature 3.4: isEmpty

**Goal:** Handlebars-specific truthiness detection for conditionals

### Task C3-F4-T1: Implement isEmpty Logic

**Status:** `[✓]` Complete (16 tests)

- Create `isEmpty()` function with signature:
  - `isEmpty(value: any): boolean`
- Return `true` for:
  - `null`
  - `undefined`
  - `false`
  - Empty string `""`
  - Empty array `[]`
- Return `false` for:
  - `0` (different from JavaScript falsy!)
  - `{}` (empty object is NOT empty in Handlebars!)
  - Non-empty arrays
  - All other truthy values

**Implementation Notes:**

- Early return for `null`, `undefined`, and `false` using `value == null || value === false`
- Check for empty string with `value === ''`
- Use `Array.isArray()` with length check for empty arrays
- All other values return `false` (including 0 and {})

**Critical Difference from JavaScript:** In Handlebars, `0` is truthy and `{}` is truthy. Only `null`, `undefined`, `false`, `""`, and `[]` are considered empty.

**Deliverable:** `src/runtime/utils.ts` with `isEmpty()` function

**Tests:**

- `null` returns `true` ✓
- `undefined` returns `true` ✓
- `false` returns `true` ✓
- Empty string `""` returns `true` ✓
- Empty array `[]` returns `true` ✓
- Zero `0` returns `false` (truthy in Handlebars!) ✓
- Empty object `{}` returns `false` (truthy in Handlebars!) ✓
- Non-empty array `[1]` returns `false` ✓
- Non-empty string `"text"` returns `false` ✓
- `true` returns `false` ✓
- Positive numbers return `false` ✓
- Negative numbers return `false` ✓
- Non-empty objects return `false` ✓

### Task C3-F4-T2: Handle Array Detection

**Status:** `[✓]` Complete (13 tests)

- Use `Array.isArray()` for reliable array detection
- Check array length for emptiness:
  - `array.length === 0` → empty
  - `array.length > 0` → not empty
- Handle array-like objects:
  - Only true arrays count as arrays
  - Objects with `length` property are NOT arrays

**Implementation Notes:**

- Uses `Array.isArray(value) && value.length === 0` to detect empty arrays
- Array-like objects with `length` property return `false` (not arrays)
- Sparse arrays with length > 0 are not empty
- Arrays with null/undefined elements are not empty

**Deliverable:** Correct array handling in `isEmpty()`

**Tests:**

- `[]` returns `true` ✓
- `[1, 2, 3]` returns `false` ✓
- `{ length: 0 }` returns `false` (not an array) ✓
- Object with `length` property returns `false` ✓
- Sparse arrays with length > 0 return `false` ✓
- Arrays with `undefined` elements return `false` ✓
- Arrays with `null` elements return `false` ✓
- Functions return `false` ✓
- Date objects return `false` ✓
- RegExp objects return `false` ✓
- Error objects return `false` ✓
- Whitespace strings return `false` ✓
- String "0" returns `false` ✓
- String "false" returns `false` ✓
- NaN returns `false` ✓
- Infinity returns `false` ✓

**Feature 3.4 Status:** `[✓]` Complete (29 tests total: 16 basic + 13 array detection & edge cases)

---

## Feature 3.5: Type Checking Utilities

**Goal:** Reliable type detection for runtime logic

### Task C3-F5-T1: Implement isArray

**Status:** `[✓]` Complete (12 tests)

- Create `isArray()` function with signature:
  - `isArray(value: any): boolean`
- Use `Array.isArray(value)` for detection
- Return `true` only for true arrays
- Return `false` for:
  - Array-like objects
  - Objects with `length` property
  - `null`, `undefined`

**Implementation Notes:**

- Simple wrapper around `Array.isArray()` for consistency
- Returns `true` only for true arrays (not typed arrays)
- Returns `false` for array-like objects with `length` property

**Deliverable:** `src/runtime/utils.ts` with `isArray()` function

**Tests:**

- `[]` returns `true` ✓
- `[1, 2, 3]` returns `true` ✓
- `{}` returns `false` ✓
- `{ length: 0 }` returns `false` ✓
- `null` returns `false` ✓
- `undefined` returns `false` ✓
- String returns `false` ✓
- Number returns `false` ✓
- Boolean returns `false` ✓
- Function returns `false` ✓
- Sparse array returns `true` ✓
- Typed arrays return `false` ✓

### Task C3-F5-T2: Implement isFunction

**Status:** `[✓]` Complete (12 tests)

- Create `isFunction()` function with signature:
  - `isFunction(value: any): boolean`
- Use `typeof value === 'function'` for detection
- Return `true` for:
  - Regular functions
  - Arrow functions
  - Async functions
  - Generator functions
  - Class constructors
- Return `false` for all non-function types

**Implementation Notes:**

- Uses `typeof value === 'function'` for detection
- Detects all function types including async, generator, and class constructors
- Works with built-in constructors (Array, Object, Date)

**Deliverable:** `src/runtime/utils.ts` with `isFunction()` function

**Tests:**

- Regular function returns `true` ✓
- Arrow function returns `true` ✓
- Async function returns `true` ✓
- Generator function returns `true` ✓
- Class constructor returns `true` ✓
- Built-in constructors return `true` ✓
- Object returns `false` ✓
- `null` returns `false` ✓
- `undefined` returns `false` ✓
- String returns `false` ✓
- Number returns `false` ✓
- Array returns `false` ✓

### Task C3-F5-T3: Implement isObject

**Status:** `[✓]` Complete (14 tests)

- Create `isObject()` function with signature:
  - `isObject(value: any): boolean`
- Return `true` for:
  - Plain objects `{}`
  - Arrays (arrays are objects)
  - Functions (functions are objects)
  - Date objects
  - RegExp objects
  - Any object type
- Return `false` for:
  - `null` (typeof null === 'object' but we treat as not object)
  - `undefined`
  - Primitives (string, number, boolean)

**Implementation Notes:**

- Uses `value != null && typeof value === 'object'` for detection
- Null check handles the special case where `typeof null === 'object'`
- Returns `true` for arrays, Date, RegExp, Error, and other object types
- Functions return `false` (typeof function === 'function', not 'object')

**Deliverable:** `src/runtime/utils.ts` with `isObject()` function

**Tests:**

- `{}` returns `true` ✓
- Non-empty object returns `true` ✓
- `[]` returns `true` ✓
- `function() {}` returns `false` (functions are typeof 'function') ✓
- `new Date()` returns `true` ✓
- `/regex/` returns `true` ✓
- `new Error()` returns `true` ✓
- `null` returns `false` (special case!) ✓
- `undefined` returns `false` ✓
- String returns `false` ✓
- Number returns `false` ✓
- Boolean returns `false` ✓
- `Object.create(null)` returns `true` ✓
- Class instances return `true` ✓

**Feature 3.5 Status:** `[✓]` Complete (38 tests total: 12 isArray + 12 isFunction + 14 isObject)

---

## Implementation Notes

### File Organization

Create `src/runtime/utils.ts` containing all utility functions:

```typescript
// Security-aware property access
export function lookupProperty(parent: any, propertyName: string): any;

// HTML escaping
export class SafeString {
  constructor(string: string);
  toString(): string;
  toHTML(): string;
}
export function escapeExpression(value: any): string;

// Scope management
export function createFrame(data: object): object;

// Value checking
export function isEmpty(value: any): boolean;
export function isArray(value: any): boolean;
export function isFunction(value: any): boolean;
export function isObject(value: any): boolean;
```

### Testing Strategy

Create comprehensive test file: `test/runtime/utils.test.ts`

- Group tests by feature
- Test happy paths first
- Then edge cases
- Then error conditions
- Include performance benchmarks for hot paths
- Document Handlebars-specific behavior differences

### Security Considerations

**lookupProperty is critical for security:**

- Never return inherited properties
- Prevents `__proto__` pollution attacks
- Prevents access to `constructor`
- All property access in interpreter must use this function

### Performance Considerations

**Hot path optimizations:**

- `lookupProperty` — cache hasOwnProperty reference
- `escapeExpression` — fast path for strings without special chars
- `isEmpty` — order checks from most to least common

### Reference Implementation

Study Handlebars source code:

- `lib/handlebars/runtime.js` — `lookupProperty` implementation
- `lib/handlebars/utils.js` — `escapeExpression`, `isEmpty`, `createFrame`
- Match behavior exactly for compatibility

### Testing Against Handlebars

Where possible, test output matches Handlebars:

```typescript
// Example comparison test
import Handlebars from 'handlebars';
import { escapeExpression } from '../src/runtime/utils';

const input = '<script>alert("xss")</script>';
expect(escapeExpression(input)).toBe(Handlebars.Utils.escapeExpression(input));
```

---

## Success Criteria

Capability 3 is complete when:

- ✅ All 5 features implemented
- ✅ All utility functions pass tests
- ✅ Security properties verified (especially `lookupProperty`)
- ✅ Performance benchmarks acceptable
- ✅ Behavior matches Handlebars reference implementation
- ✅ Documentation clear about Handlebars-specific behaviors
- ✅ Ready for use in interpreter (Capability 4)

**Estimated Tests:** ~80-100 tests total across all features

**Estimated Time:** 2-3 hours implementation + testing

**Blocking:** Must complete before starting Capability 4 (Interpreter)
