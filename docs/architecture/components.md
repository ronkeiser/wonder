# @wonder/components

A headless Svelte 5 component library with a clean styling layer.

## Philosophy

We're not adopting a component library wholesale. Instead, we're building our own primitives that:

1. **Are headless at the core** - behavior, accessibility, and state management without styling opinions
2. **Expose state via data attributes** - enabling Tailwind's `data-[state=*]:` variants for styling
3. **Use Svelte 5 snippets** - idiomatic composition without React-style compound components
4. **Provide a styling layer** - maps design tokens to data attributes without coupling to the headless core

## Why Snippets Over Compound Components

Libraries like Bits UI and Radix use compound component patterns (`Dialog.Root`, `Dialog.Trigger`, etc.). This comes from React, where it makes sense due to lack of native slots.

Svelte 5 snippets are more idiomatic:

- **Explicit** - you see exactly what slots exist and what props they receive
- **No wrapper component** - no `Dialog.Root` just to provide context
- **Props flow down** - snippets receive typed props (aria attributes, event handlers)
- **No context magic** - the parent component owns state directly
- **TypeScript-native** - snippet props are typed naturally

```svelte
<!-- Compound pattern (React-style, avoid) -->
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<!-- Snippet pattern (Svelte-native, preferred) -->
<Dialog>
  {#snippet trigger(props)}
    <button {...props}>Open</button>
  {/snippet}

  {#snippet title()}Settings{/snippet}

  <p>Dialog content here</p>
</Dialog>
```

## Dependencies

Minimal external dependencies:

- **@floating-ui/dom** (~3kb gzipped) - positioning for popovers, dropdowns, tooltips
- **Tailwind CSS** - styling (consumed via the styling layer)

Everything else is implemented with Svelte primitives.

## Architecture

### Two Layers

```
┌─────────────────────────────────────────┐
│           Styled Components             │  ← Design system: variants, sizes, tokens
│  (imports headless, applies classes)    │
├─────────────────────────────────────────┤
│          Headless Components            │  ← Behavior, a11y, state, data-attributes
│  (no styling, just functionality)       │
└─────────────────────────────────────────┘
```

### Headless Layer

Headless components handle:

- **Accessibility** - ARIA attributes, roles, keyboard navigation
- **State management** - open/closed, selected, disabled, etc.
- **Focus management** - trapping, restoration, roving tabindex
- **Event handling** - click outside, escape key, etc.
- **Positioning** - via Floating UI for floating elements

They expose state through **data attributes**:

```svelte
<!-- Headless button internally renders: -->
<button
  data-state={pressed ? 'pressed' : 'idle'}
  data-disabled={disabled || undefined}
  {...props}
>
  {@render children()}
</button>
```

### Styling Layer

The styling layer wraps headless components and applies classes based on:

1. **Props** - `variant="primary"`, `size="md"`
2. **Data attributes** - `data-[state=pressed]:bg-blue-700`

Style definitions are separate from components:

```typescript
// styles/button.ts
export const buttonStyles = {
  base: 'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  variant: {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 data-[disabled]:opacity-50',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    ghost: 'hover:bg-gray-100',
  },
  size: {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  },
};
```

## Data Attribute Convention

Components use consistent data attributes:

| Attribute | Values | Usage |
|-----------|--------|-------|
| `data-state` | `open`, `closed`, `pressed`, `idle`, `checked`, `unchecked` | Primary state |
| `data-disabled` | present or absent | Disabled state |
| `data-highlighted` | present or absent | Keyboard/hover focus in lists |
| `data-selected` | present or absent | Selected item in lists |
| `data-invalid` | present or absent | Validation state |
| `data-orientation` | `horizontal`, `vertical` | Layout direction |

This enables Tailwind styling:

```svelte
<Dialog.Content class="data-[state=open]:animate-in data-[state=closed]:animate-out">
```

## Package Structure

```
packages/components/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── index.ts                    # Headless exports
│   ├── styled.ts                   # Styled exports (optional)
│   ├── lib/
│   │   ├── actions/                # Svelte actions
│   │   │   ├── clickOutside.ts
│   │   │   ├── focusTrap.ts
│   │   │   └── portal.ts
│   │   ├── utils/
│   │   │   ├── floating.ts         # Floating UI helpers
│   │   │   ├── focus.ts            # Focus management utilities
│   │   │   └── keyboard.ts         # Keyboard navigation helpers
│   │   ├── Button.svelte
│   │   ├── Dialog.svelte
│   │   ├── Popover.svelte
│   │   ├── Select.svelte
│   │   └── ...
│   └── styles/                     # Style definitions
│       ├── button.ts
│       ├── dialog.ts
│       └── index.ts
```

With the snippet pattern, each component is a single file. No need for subdirectories with multiple compound pieces.

## Component Inventory

### Priority 1 (Core)

These establish the foundational patterns:

| Component | Teaches |
|-----------|---------|
| **Button** | Basic pattern, data attributes, props |
| **Dialog** | Portal, overlay, focus trap, escape handling, compound pattern |
| **Popover** | Floating UI integration, click outside, anchor positioning |
| **Select** | Listbox pattern, keyboard navigation, floating + selection state |

### Priority 2

| Component | Notes |
|-----------|-------|
| **Tooltip** | Simple floating, delay logic |
| **DropdownMenu** | Menu pattern, submenus |
| **Tabs** | Roving tabindex, panel association |
| **Checkbox** | Form integration, indeterminate state |
| **Switch** | Toggle pattern |
| **RadioGroup** | Group selection, roving focus |

### Priority 3

| Component | Notes |
|-----------|-------|
| **Combobox** | Autocomplete, async loading |
| **AlertDialog** | Blocking dialog variant |
| **Toast** | Announcements, auto-dismiss |
| **Slider** | Range input, accessibility |
| **Accordion** | Collapsible sections |

## Usage Examples

### Headless (full control)

```svelte
<script>
  import { Dialog } from '@wonder/components';
</script>

<Dialog>
  {#snippet trigger(props)}
    <button {...props} class="px-4 py-2 bg-blue-600 text-white rounded">
      Open
    </button>
  {/snippet}

  {#snippet title()}Title{/snippet}
  {#snippet description()}Description text.{/snippet}

  <p>Dialog content here</p>

  {#snippet close(props)}
    <button {...props} class="absolute top-2 right-2">×</button>
  {/snippet}
</Dialog>
```

The `trigger`, `close`, and other interactive snippets receive props containing event handlers and ARIA attributes that must be spread onto the element.

### Styled (design system)

```svelte
<script>
  import { Dialog } from '@wonder/components/styled';
</script>

<Dialog size="md">
  {#snippet trigger(props)}
    <Button {...props} variant="primary">Open</Button>
  {/snippet}

  {#snippet title()}Title{/snippet}
  {#snippet description()}Description text.{/snippet}

  <p>Dialog content here</p>
</Dialog>
```

The styled layer applies default classes for overlay, content positioning, and animations. You still provide snippets, but with less boilerplate.

## Implementation Notes

### Component Structure

With snippets, each component is self-contained. State lives in the component, and snippets receive what they need via props:

```svelte
<!-- Dialog.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface TriggerProps {
    onclick: () => void;
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
  }

  interface CloseProps {
    onclick: () => void;
    'aria-label': string;
  }

  let {
    trigger,
    title,
    description,
    close,
    children,
    open = $bindable(false),
  }: {
    trigger: Snippet<[TriggerProps]>;
    title?: Snippet;
    description?: Snippet;
    close?: Snippet<[CloseProps]>;
    children?: Snippet;
    open?: boolean;
  } = $props();

  function handleOpen() { open = true; }
  function handleClose() { open = false; }
</script>

{@render trigger({
  onclick: handleOpen,
  'aria-haspopup': 'dialog',
  'aria-expanded': open,
})}

{#if open}
  <!-- Portal, overlay, focus trap, etc. -->
  <div role="dialog" aria-modal="true" data-state={open ? 'open' : 'closed'}>
    {#if title}{@render title()}{/if}
    {#if description}{@render description()}{/if}
    {@render children?.()}
    {#if close}
      {@render close({ onclick: handleClose, 'aria-label': 'Close dialog' })}
    {/if}
  </div>
{/if}
```

Note: `open` uses `$bindable()` so consumers can control it externally if needed.

### Focus Management

- **Focus trap** - implemented as a Svelte action, traps focus within dialog/modal
- **Focus restoration** - store active element before opening, restore on close
- **Roving tabindex** - for keyboard navigation in lists/menus

### Keyboard Handling

Standard keyboard patterns per ARIA APG:

- `Escape` - close dialogs, popovers, menus
- `Enter/Space` - activate buttons, triggers
- `Arrow keys` - navigate lists, menus
- `Tab` - move focus (trapped in modals)
- `Home/End` - jump to first/last in lists

### Floating UI Integration

Wrap Floating UI in a reactive helper:

```typescript
// utils/floating.ts
export function createFloating(reference: HTMLElement, floating: HTMLElement, options: FloatingOptions) {
  // Returns reactive position that updates on scroll/resize
}
```

Used in Popover, Select, Tooltip, DropdownMenu.

## Lessons from Melt UI

Melt UI is a mature headless library (38+ components) using a builder pattern. While we're not adopting their architecture wholesale, several patterns are worth learning from:

### What They Do Well

**1. Escape Behavior Configuration**

Melt UI offers nuanced escape key handling:
- `"close"` - always close on Escape
- `"ignore"` - never close on Escape
- `"defer-otherwise-close"` - let event propagate, close if not prevented
- `"defer-otherwise-ignore"` - let event propagate, do nothing if not prevented

The "defer" variants are useful when nested dialogs or other components need to intercept Escape first. We should support similar configurability.

**2. Interact-Outside Detection**

Their click-outside detection uses dual-phase event listening (capture + bubbling) to:
- Distinguish real outside clicks from intercepted events
- Handle shadow DOM correctly
- Support touch devices

This is more robust than a naive `document.addEventListener('click', ...)`.

**3. Roving Focus Pattern**

For keyboard navigation in lists/menus:
- Only one element has `tabIndex={0}` at a time
- Others get `tabIndex={-1}`
- Arrow keys move the `tabIndex={0}` and focus

They also handle direction-aware navigation (respecting RTL layouts).

**4. Floating UI Middleware Stack**

Their standard middleware order:
1. `flip()` - reverse placement if insufficient space
2. `offset()` - distance from anchor
3. `shift()` - prevent overflow
4. `arrow()` - position arrow element
5. `size()` - viewport constraints

Plus `autoUpdate()` for repositioning on scroll/resize.

**5. Focus Target Configuration**

`openFocus` and `closeFocus` props accept:
- CSS selector string
- Direct element reference
- Function returning element

This flexibility is worth adopting for Dialog/Popover.

**6. Typeahead in Select**

Type characters to jump to matching items without opening the dropdown. This is standard ARIA listbox behavior - users expect to be able to focus a select and type "ca" to jump to "California".

**7. Scroll Lock**

When a modal opens, body scroll is prevented. This is harder than `overflow: hidden`:
- Windows shows scrollbar, removing it causes layout shift - need to add padding to compensate
- iOS Safari requires `position: fixed` on body with negative top offset
- Nested scrollable regions inside the modal should still scroll

**8. Active Trigger Tracking**

For popovers with multiple triggers, track which trigger opened it so focus returns to the correct element on close. Without this, focus restoration breaks when the same popover can be opened from different places.

**9. ARIA ID Relationships**

`aria-labelledby`, `aria-describedby`, `aria-controls` require unique IDs linking elements. They use nanoid for generation. We need:
- A utility to generate unique IDs
- A pattern for components to create and associate IDs between trigger/content/title/description elements

**10. The Defer Escape Pattern (Detail)**

The "defer-otherwise-close" behavior isn't just "propagate first":
1. Listen for Escape keydown
2. Don't call `preventDefault()` or `stopPropagation()`
3. Wait a tick for event to fully bubble
4. Check `event.defaultPrevented`
5. If not prevented, close; otherwise do nothing

This allows inner components (like a nested dialog) to handle the event first and prevent the outer dialog from closing.

### What We're Doing Differently

| Melt UI | Our Approach |
|---------|--------------|
| Builder functions (`createDialog()`) | Svelte components with snippets |
| Svelte 4 stores | Svelte 5 runes (`$state`, `$bindable`) |
| Hybrid store/action pattern | Pure actions + component state |
| Elements returned as stores | Props passed to snippets |

### Utilities to Implement

Based on Melt UI's patterns, our utility layer should include:

```
actions/
├── clickOutside.ts    # Dual-phase interact-outside detection
├── focusTrap.ts       # Trap focus within element
├── portal.ts          # Move element to target container
└── escapeKeydown.ts   # Configurable escape handling

utils/
├── floating.ts        # Floating UI wrapper with standard middleware
├── focus.ts           # Focus management (save/restore, custom targets)
├── keyboard.ts        # Direction-aware key handling, roving focus, typeahead
├── id.ts              # Unique ID generation for ARIA relationships
└── scrollLock.ts      # Body scroll prevention with platform quirks handled
```
