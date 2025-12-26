<script lang="ts">
  import { Button as ButtonPrimitive, type ButtonProps } from '@wonder/components';

  type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
  type Size = 'sm' | 'md' | 'lg';

  let {
    variant = 'primary',
    size = 'md',
    disabled,
    ...restProps
  }: ButtonProps & {
    variant?: Variant;
    size?: Size;
  } = $props();

  const baseClasses =
    'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 no-underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

  const variantClasses: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface-overlay text-foreground hover:bg-surface-hover',
    danger: 'bg-error text-white hover:bg-red/90',
    ghost: 'bg-transparent text-foreground hover:bg-surface-hover',
  };

  const sizeClasses: Record<Size, string> = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-6 py-2 text-sm',
    lg: 'px-8 py-3 text-base',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`;
</script>

<ButtonPrimitive class={classes} {disabled} {...restProps} />
