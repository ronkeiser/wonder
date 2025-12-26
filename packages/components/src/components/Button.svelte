<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type SharedProps = {
    disabled?: boolean;
    children: Snippet;
    class?: string;
  };

  export type ButtonProps = SharedProps &
    Omit<HTMLButtonAttributes, 'disabled' | 'children' | 'class'> & {
      href?: undefined;
    };

  export type AnchorProps = SharedProps &
    Omit<HTMLAnchorAttributes, 'href' | 'children' | 'class'> & {
      href: string;
    };

  export type Props = ButtonProps | AnchorProps;
</script>

<script lang="ts">
  let props: Props = $props();
</script>

{#if props.href !== undefined}
  {@const { href, children, disabled, class: className, ...rest } = props}
  <a
    {href}
    aria-disabled={disabled || undefined}
    tabindex={disabled ? -1 : undefined}
    data-disabled={disabled || undefined}
    class={className}
    {...rest}
  >
    {@render children()}
  </a>
{:else}
  {@const { children, disabled, class: className, type = 'button', ...rest } = props}
  <button
    {type}
    {disabled}
    data-disabled={disabled || undefined}
    class={className}
    {...rest}
  >
    {@render children()}
  </button>
{/if}
