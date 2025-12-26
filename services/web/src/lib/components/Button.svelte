<script lang="ts">
  let {
    type = "button",
    variant = "primary",
    disabled = false,
    children,
    ...restProps
  }: {
    type?: "button" | "submit" | "reset";
    variant?: "primary" | "secondary" | "danger";
    disabled?: boolean;
    children: any;
    [key: string]: unknown;
  } = $props();

  let variantClasses = $derived(
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "secondary"
        ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
        : "bg-red-600 text-white hover:bg-red-700"
  );
</script>

<button
  {type}
  {disabled}
  class="px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed {variantClasses}"
  {...restProps}
>
  {@render children()}
</button>
