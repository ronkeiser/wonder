<script lang="ts">
  import type { Readable, Writable } from "svelte/store";
  import { createFieldHandler } from "@wonder/forms";

  let {
    id,
    name,
    label,
    type = "text",
    value,
    error,
    required = false,
    autocomplete,
    ...restProps
  }: {
    id?: string;
    name: string;
    label: string;
    type?: "text" | "email" | "password";
    value: Writable<Record<string, string>>;
    error?: Readable<Record<string, string | undefined>>;
    required?: boolean;
    autocomplete?: AutoFill;
    [key: string]: unknown;
  } = $props();

  let inputId = $derived(id ?? name);
  let errorId = $derived(`${inputId}-error`);
  let fieldValue = $derived($value[name] ?? "");
  let errorMessage = $derived(error ? ($error?.[name] ?? undefined) : undefined);
  let hasError = $derived(!!errorMessage);

  let oninput = createFieldHandler(value, name);
</script>

<div>
  <label for={inputId} class="block text-sm font-medium mb-1">
    {label}
  </label>

  <input
    {type}
    id={inputId}
    {name}
    value={fieldValue}
    {oninput}
    {required}
    {autocomplete}
    aria-required={required}
    aria-invalid={hasError}
    aria-describedby={hasError ? errorId : undefined}
    class="w-full px-3 py-2 border rounded-md"
    class:border-red-500={hasError}
    class:border-gray-300={!hasError}
    {...restProps}
  />

  {#if errorMessage}
    <p id={errorId} class="mt-1 text-sm text-red-600" role="alert">{errorMessage}</p>
  {/if}
</div>
