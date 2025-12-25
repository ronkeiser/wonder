<script lang="ts">
  import { Dialog, Tooltip, Popover } from '@wonder/components';

  let dialogOpen = $state(false);
</script>

<svelte:head>
  <title>Playground</title>
</svelte:head>

<div class="p-6">
  <h1 class="text-xl font-semibold mb-6">Component Playground</h1>

  <section class="mb-8">
    <h2 class="text-lg font-medium mb-4">Dialog</h2>

    <Dialog bind:open={dialogOpen} labelledby="dialog-title" describedby="dialog-description">
      {#snippet trigger(props)}
        <button
          {...props}
          class="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          Open Dialog
        </button>
      {/snippet}

      {#snippet overlay(props)}
        <div
          {...props}
          class="fixed inset-0 bg-black/50 z-40 opacity-0 transition-opacity duration-300 ease-out data-[state=open]:opacity-100"
        ></div>
      {/snippet}

      {#snippet content(props)}
        <div
          {...props}
          class="group fixed inset-0 z-50 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-200 ease-out data-[state=open]:opacity-100"
        >
          <div
            class="bg-surface border border-border rounded-lg shadow-lg p-6 w-full max-w-md pointer-events-auto scale-95 transition-transform duration-200 ease-out group-data-[state=open]:scale-100"
          >
            <h2 id="dialog-title" class="text-lg font-semibold mb-2">Dialog Title</h2>
            <p id="dialog-description" class="text-foreground-muted mb-4">
              This is a headless dialog component with focus trapping, scroll lock, and escape key
              handling.
            </p>
            <div class="flex justify-end gap-2">
              <button
                class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors"
                onclick={() => (dialogOpen = false)}
              >
                Cancel
              </button>
              <button
                class="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                onclick={() => (dialogOpen = false)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      {/snippet}
    </Dialog>
  </section>

  <section class="mb-8">
    <h2 class="text-lg font-medium mb-4">Tooltip</h2>

    <div class="flex gap-4">
      <Tooltip
        placement="top"
        class="bg-surface-raised border border-border text-sm px-3 py-2 rounded shadow-lg opacity-0 transition-opacity duration-150 ease-out data-[state=open]:opacity-100"
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors"
          >
            Hover me (top)
          </button>
        {/snippet}

        {#snippet content()}
          Tooltip on top
        {/snippet}
      </Tooltip>

      <Tooltip
        placement="bottom"
        class="bg-surface-raised border border-border text-sm px-3 py-2 rounded shadow-lg opacity-0 transition-opacity duration-150 ease-out data-[state=open]:opacity-100"
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors"
          >
            Hover me (bottom)
          </button>
        {/snippet}

        {#snippet content()}
          Tooltip on bottom
        {/snippet}
      </Tooltip>

      <Tooltip
        placement="right"
        delay={0}
        class="bg-surface-raised border border-border text-sm px-3 py-2 rounded shadow-lg opacity-0 transition-opacity duration-150 ease-out data-[state=open]:opacity-100"
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors"
          >
            Instant (right)
          </button>
        {/snippet}

        {#snippet content()}
          No delay tooltip
        {/snippet}
      </Tooltip>
    </div>
  </section>

  <section class="mb-8">
    <h2 class="text-lg font-medium mb-4">Popover</h2>

    <div class="flex gap-4">
      <Popover
        placement="bottom-start"
        class="bg-surface-raised border border-border rounded-lg shadow-lg p-4 w-64 opacity-0 transition-opacity duration-150 ease-out data-[state=open]:opacity-100"
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            Open Popover
          </button>
        {/snippet}

        {#snippet content(props)}
          <h3 class="font-medium mb-2">Popover Title</h3>
          <p class="text-foreground-muted text-sm mb-3">
            This is interactive content. You can click inside without closing.
          </p>
          <button
            class="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/90 transition-colors"
          >
            Action
          </button>
        {/snippet}
      </Popover>

      <Popover
        placement="right"
        class="bg-surface-raised border border-border rounded-lg shadow-lg p-4 w-48 opacity-0 transition-opacity duration-150 ease-out data-[state=open]:opacity-100"
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors"
          >
            Right Popover
          </button>
        {/snippet}

        {#snippet content(props)}
          <p class="text-sm mb-2">Positioned to the right of the trigger.</p>
          <input
            type="text"
            placeholder="Type here..."
            class="w-full px-2 py-1 text-sm border border-border rounded bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
          />
        {/snippet}
      </Popover>
    </div>
  </section>
</div>

