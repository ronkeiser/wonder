# Template Cookbook

Practical recipes and patterns for common template rendering scenarios.

## Table of Contents

- [Data Formatting](#data-formatting)
- [Lists and Tables](#lists-and-tables)
- [Conditionals](#conditionals)
- [Working with Helpers](#working-with-helpers)
- [Nested Data](#nested-data)
- [Common Patterns](#common-patterns)

## Data Formatting

### Format numbers with thousands separators

```typescript
import { compile } from '@wonder/templates';

const template = compile('Total: {{formattedAmount}}');

const output = template({
  formattedAmount: (12345.67).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  }),
});
// Output: "Total: $12,345.67"
```

### Format dates

```typescript
const template = compile('Posted on {{date}}');

const output = template({
  date: new Date('2024-12-07').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
});
// Output: "Posted on December 7, 2024"
```

### Truncate long text

```typescript
const template = compile('{{summary}}...');

const longText = 'This is a very long article about templates...';
const output = template({
  summary: longText.slice(0, 50),
});
// Output: "This is a very long article about templates..."
```

## Lists and Tables

### Simple list with numbers

```handlebars
{{#each items}}
  {{@index}}.
  {{this}}
{{/each}}
```

```typescript
const template = compile(`{{#each items}}
  {{@index}}. {{this}}
{{/each}}`);

const output = template({
  items: ['Apples', 'Oranges', 'Bananas'],
});
// Output:
// 0. Apples
// 1. Oranges
// 2. Bananas
```

### Table with headers

```handlebars
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Role</th>
    </tr>
  </thead>
  <tbody>
    {{#each users}}
      <tr>
        <td>{{name}}</td>
        <td>{{email}}</td>
        <td>{{role}}</td>
      </tr>
    {{/each}}
  </tbody>
</table>
```

```typescript
const template = compile(`<table>
  <thead>
    <tr><th>Name</th><th>Email</th><th>Role</th></tr>
  </thead>
  <tbody>
    {{#each users}}
    <tr><td>{{name}}</td><td>{{email}}</td><td>{{role}}</td></tr>
    {{/each}}
  </tbody>
</table>`);

const output = template({
  users: [
    { name: 'Alice', email: 'alice@example.com', role: 'Admin' },
    { name: 'Bob', email: 'bob@example.com', role: 'User' },
  ],
});
```

### List with alternating styles

```handlebars
{{#each items}}
  <div class="{{#if @first}}first{{else}}{{#if @last}}last{{else}}middle{{/if}}{{/if}}">
    {{this}}
  </div>
{{/each}}
```

### Empty list handling

```handlebars
{{#each items}}
  <li>{{this}}</li>
{{else}}
  <li>No items found</li>
{{/each}}
```

## Conditionals

### Show/hide based on boolean

```handlebars
{{#if isActive}}
  <span class='active'>Active</span>
{{else}}
  <span class='inactive'>Inactive</span>
{{/if}}
```

### Multiple conditions

```handlebars
{{#if (and isLoggedIn hasPermission)}}
  <button>Edit</button>
{{/if}}

{{#if (or isAdmin isModerator)}}
  <button>Delete</button>
{{/if}}
```

### Comparison checks

```handlebars
{{#if (gt score 80)}}
  <span class='grade-a'>Excellent!</span>
{{else if (gt score 60)}}
  <span class='grade-b'>Good</span>
{{else}}
  <span class='grade-c'>Needs improvement</span>
{{/if}}
```

### Handle zero vs empty

```handlebars
{{#if count includeZero=true}}
  Count:
  {{count}}
{{else}}
  No count available
{{/if}}
```

## Working with Helpers

### Custom helper for string operations

```typescript
import { compile } from '@wonder/templates';

const template = compile('{{uppercase name}}');

const output = template.render(
  { name: 'alice' },
  {
    helpers: {
      uppercase: (str: string) => str.toUpperCase(),
    },
  },
);
// Output: "ALICE"
```

### Block helper with custom logic

```typescript
const template = compile(`{{#repeat count}}
  {{this}}
{{/repeat}}`);

const output = template.render(
  { count: 3 },
  {
    helpers: {
      repeat: function (count: number, options: any) {
        let result = '';
        for (let i = 0; i < count; i++) {
          result += options.fn(i);
        }
        return result;
      },
    },
  },
);
// Output: "0 1 2"
```

### Helper with hash arguments

```handlebars
{{formatDate date format='YYYY-MM-DD'}}
```

```typescript
const template = compile(`{{formatDate date format='long'}}`);

const output = template.render(
  { date: new Date('2024-12-07') },
  {
    helpers: {
      formatDate: (date: Date, options: any) => {
        const format = options.hash.format || 'short';
        if (format === 'long') {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        }
        return date.toLocaleDateString();
      },
    },
  },
);
// Output: "December 7, 2024"
```

## Nested Data

### Access parent context in nested loops

```handlebars
{{#each categories}}
  <h2>{{name}}</h2>
  {{#each items}}
    <div>{{this}} in {{../name}}</div>
  {{/each}}
{{/each}}
```

```typescript
const template = compile(`{{#each categories}}
  <h2>{{name}}</h2>
  {{#each items}}
    <div>{{this}} in {{../name}}</div>
  {{/each}}
{{/each}}`);

const output = template({
  categories: [
    { name: 'Fruits', items: ['Apple', 'Orange'] },
    { name: 'Vegetables', items: ['Carrot', 'Broccoli'] },
  ],
});
```

### Dynamic property access with lookup

```handlebars
{{#each users}}
  {{lookup this fieldName}}
{{/each}}
```

```typescript
const template = compile(`{{#each users}}
  {{lookup this ../fieldName}}
{{/each}}`);

const output = template({
  fieldName: 'email',
  users: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
});
// Output: "alice@example.com bob@example.com"
```

## Common Patterns

### Comma-separated list

```handlebars
{{#each items}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
```

```typescript
const template = compile(`{{#each items}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}`);

const output = template({
  items: ['red', 'green', 'blue'],
});
// Output: "red, green, blue"
```

### Breadcrumb navigation

```handlebars
{{#each breadcrumbs}}
  {{#if @last}}
    <span>{{title}}</span>
  {{else}}
    <a href='{{url}}'>{{title}}</a>
    &gt;
  {{/if}}
{{/each}}
```

### Status badge

```handlebars
<span class="badge badge-{{#if (eq status 'active')}}success{{else}}{{#if (eq status 'pending')}}warning{{else}}danger{{/if}}{{/if}}">
  {{status}}
</span>
```

### Default value fallback

```handlebars
{{#if title}}
  {{title}}
{{else}}
  Untitled Document
{{/if}}
```

### Counting items with conditions

```handlebars
{{#each items}}
  {{#if (gt this.score 80)}}
    {{! Count high scores }}
    {{this.name}}
    ⭐
  {{/if}}
{{/each}}
```

### Building JSON output

```typescript
const template = compile(`{
  "users": [
    {{#each users}}
    {
      "name": "{{name}}",
      "email": "{{email}}"
    }{{#unless @last}},{{/unless}}
    {{/each}}
  ]
}`);

const output = template({
  users: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
  ],
});
```

### Context switching with `#with`

```handlebars
{{#with user}}
  <div class='profile'>
    <h2>{{name}}</h2>
    <p>{{email}}</p>
    {{#with settings}}
      <div>Theme: {{theme}}</div>
      <div>Language: {{language}}</div>
    {{/with}}
  </div>
{{/with}}
```

## Tips and Best Practices

### 1. Prepare data before templating

Instead of complex logic in templates, transform data first:

```typescript
// Good
const data = {
  formattedDate: date.toLocaleDateString(),
  truncatedText: longText.slice(0, 100),
  isHighScore: score > 80,
};
const output = template(data);

// Avoid
const output = template({ date, longText, score });
// Then doing complex formatting in the template
```

### 2. Use helpers for reusable logic

```typescript
const helpers = {
  formatCurrency: (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
  formatDate: (date: Date) => date.toLocaleDateString(),
  pluralize: (count: number, singular: string, plural: string) => (count === 1 ? singular : plural),
};

template.render(data, { helpers });
```

### 3. Handle missing data gracefully

```handlebars
{{#if user}}
  {{#with user}}
    Welcome,
    {{name}}!
  {{/with}}
{{else}}
  Welcome, Guest!
{{/if}}
```

### 4. Keep templates readable

```handlebars
<!-- Good: Clear structure -->
{{#each items}}
  <div class='item'>
    <h3>{{title}}</h3>
    <p>{{description}}</p>
  </div>
{{/each}}

<!-- Avoid: Everything on one line -->
{{#each items}}<div class='item'><h3>{{title}}</h3><p>{{description}}</p></div>{{/each}}
```
