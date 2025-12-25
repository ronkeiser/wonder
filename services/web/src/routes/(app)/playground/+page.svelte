<script lang="ts">
  import { Dialog } from '@wonder/components';

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
        <div {...props} class="dialog-overlay fixed inset-0 bg-black/50 z-40"></div>
      {/snippet}

      {#snippet content(props)}
        <div
          {...props}
          class="dialog-content fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <div
            class="dialog-panel bg-surface border border-border rounded-lg shadow-lg p-6 w-full max-w-md pointer-events-auto"
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
</div>

<style>
  /* Overlay transitions */
  .dialog-overlay {
    opacity: 0;
    transition: opacity 1000ms ease-out;
  }
  .dialog-overlay[data-state='open'] {
    opacity: 1;
  }

  /* Content wrapper transitions */
  .dialog-content {
    opacity: 0;
    transition: opacity 200ms ease-out;
  }
  .dialog-content[data-state='open'] {
    opacity: 1;
  }

  /* Panel transitions */
  .dialog-panel {
    transform: scale(0.95);
    transition: transform 200ms ease-out;
  }
  .dialog-content[data-state='open'] .dialog-panel {
    transform: scale(1);
  }
</style>
