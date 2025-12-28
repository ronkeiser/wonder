# @wonder/ui Theming Design

## Overview

`@wonder/ui` provides styled components built on `@wonder/components`, `@wonder/forms`, and `@wonder/icons`. Theming is configured via TypeScript files, processed by a Vite plugin that generates:

1. Tailwind `@theme` CSS for primitives (colors, spacing, radius, fonts)
2. A virtual module with component class strings for runtime merging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Default Theme (shipped with @wonder/ui)                    │
│  + Consumer Theme (src/theme.ts)                            │
├─────────────────────────────────────────────────────────────┤
│  Vite Plugin                                                │
│  ├─ Reads ui.config.ts to find theme file location          │
│  ├─ Deep-merges consumer theme over defaults                │
│  ├─ Generates @theme CSS (primitives)                       │
│  └─ Generates virtual:wonder-theme module (merged config)   │
├─────────────────────────────────────────────────────────────┤
│  Components                                                 │
│  Import merged config, apply classes via tailwind-merge     │
└─────────────────────────────────────────────────────────────┘
```

## Theme Schema

The theme file uses `createTheme` for type safety:

```ts
import { createTheme } from '@wonder/ui';

export default createTheme({
  theme: {
    colors: {
      accent: '#7964ff',
      'accent-hover': '#8885ff',
      error: '#f85149',
      surface: '#0d0e15',
      foreground: '#ced0dc'
    },
    spacing: {
      '1': '0.25rem',
      '2': '0.5rem',
      '4': '1rem',
      '6': '1.5rem'
    },
    radius: {
      sm: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem'
    }
  },
  components: {
    button: {
      base: 'font-medium transition-colors rounded-md',
      size: {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-lg'
      },
      variant: {
        primary: 'bg-accent text-white hover:bg-accent-hover',
        secondary: 'bg-surface text-foreground hover:bg-surface-hover',
        danger: 'bg-error text-white hover:bg-red-600',
        ghost: 'bg-transparent text-foreground hover:bg-surface-hover'
      }
    },
    input: {
      base: 'rounded-md border bg-surface text-foreground',
      state: {
        default: 'border-border focus:border-accent',
        error: 'border-error focus:border-error'
      }
    }
  }
});
```

## Vite Plugin Output

### Generated CSS (primitives)

```css
@theme {
  --color-accent: #7964ff;
  --color-accent-hover: #8885ff;
  --color-error: #f85149;
  --color-surface: #0d0e15;
  --color-foreground: #ced0dc;

  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-6: 1.5rem;

  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
}
```

### Generated Virtual Module

```ts
// virtual:wonder-theme
export const config = {
  button: {
    base: "font-medium transition-colors rounded-md",
    size: {
      sm: "px-3 py-1 text-sm",
      md: "px-4 py-2",
      lg: "px-6 py-3 text-lg"
    },
    variant: {
      primary: "bg-accent text-white hover:bg-accent-hover",
      // ...
    }
  },
  // ...
};
```

## Default Config

`@wonder/ui` ships a default config that the Vite plugin uses as a base. Consumer config is merged on top:

```ts
// packages/ui/src/config/default.ts
export const defaultConfig = {
  theme: {
    colors: {
      accent: '#7964ff',
      'accent-hover': '#8885ff',
      error: '#f85149',
      surface: '#0d0e15',
      foreground: '#ced0dc'
    },
    spacing: {
      '1': '0.25rem',
      '2': '0.5rem',
      '4': '1rem',
      '6': '1.5rem'
    },
    radius: {
      sm: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem'
    }
  },
  components: {
    button: {
      base: 'font-medium transition-colors rounded-md',
      size: {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-lg'
      },
      variant: {
        primary: 'bg-accent text-white hover:bg-accent-hover',
        secondary: 'bg-surface text-foreground hover:bg-surface-hover',
        danger: 'bg-error text-white hover:bg-red-600',
        ghost: 'bg-transparent text-foreground hover:bg-surface-hover'
      }
    },
    input: {
      base: 'rounded-md border bg-surface text-foreground',
      state: {
        default: 'border-border focus:border-accent',
        error: 'border-error focus:border-error'
      }
    }
  }
};
```

## Merge Behavior

The Vite plugin merges configs in two stages:

1. **Deep merge** — Consumer config overlays default config structurally. Only the specific keys provided are replaced, not entire objects.

2. **twMerge per class string** — When merging class strings, `tailwind-merge` resolves conflicting utilities. Consumer classes win over defaults.

Example:

```
Default:  { button: { size: { md: "px-4 py-2 text-sm" } } }
Consumer: { button: { size: { md: "px-6" } } }
Result:   { button: { size: { md: "py-2 text-sm px-6" } } }
```

The `px-4` is dropped because `px-6` conflicts. The `py-2 text-sm` are preserved because they don't conflict.

## Component Implementation

Components import the merged config from the virtual module:

```svelte
<!-- Button.svelte -->
<script lang="ts">
  import { twMerge } from 'tailwind-merge';
  import { Button as ButtonPrimitive } from '@wonder/components';
  import { config } from 'virtual:wonder-theme';

  type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
  type Size = 'sm' | 'md' | 'lg';

  let { variant = 'primary', size = 'md', class: className, ...props } = $props();

  const classes = twMerge(
    config.button.base,
    config.button.size[size],
    config.button.variant[variant],
    className
  );
</script>

<ButtonPrimitive class={classes} {...props} />
```

## Consumer Usage

### 1. Add root config (optional)

Create `ui.config.ts` at project root to specify the theme file location:

```ts
// ui.config.ts
import { createConfig } from '@wonder/ui';

export default createConfig({
  theme: './src/theme.ts',
  strict: true,
  extend: true
});
```

Options:
- **`theme`** — path to the theme file (default: `./src/theme.ts`)
- **`strict`** — error on unknown keys in the theme (default: `false`)
- **`extend`** — merge consumer theme over defaults; if `false`, replaces defaults entirely (default: `true`)

### 2. Add theme file

Create the theme file with your overrides:

```ts
// src/theme.ts
import { createTheme } from '@wonder/ui';

export default createTheme({
  theme: {
    colors: {
      accent: '#8b5cf6'
    }
  },
  components: {
    button: {
      size: {
        md: 'px-6 py-3'
      }
    }
  }
});
```

### 3. Add Vite plugin

```ts
// vite.config.ts
import { wonderTheme } from '@wonder/ui/vite';

export default defineConfig({
  plugins: [wonderTheme()]
});
```

### 4. Import generated CSS

```css
/* app.css */
@import 'tailwindcss';
@import 'virtual:wonder-theme/css';
```

### 5. Use components

```svelte
<script>
  import { Button } from '@wonder/ui';
</script>

<Button variant="primary" size="md">Click me</Button>
```

The consumer's `px-6 py-3` overrides the default `px-4 py-2` for medium buttons via `tailwind-merge`.

## File Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── Button.svelte
│   │   ├── TextInput.svelte
│   │   ├── TextArea.svelte
│   │   └── index.ts
│   ├── config/
│   │   └── default.ts     # default theme + component config
│   └── index.ts
├── vite/
│   └── plugin.ts          # Vite plugin implementation
├── package.json
└── docs/
    └── design.md
```