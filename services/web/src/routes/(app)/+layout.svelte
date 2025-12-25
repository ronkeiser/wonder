<script lang="ts">
  import {
    Sidebar,
    Select,
    DropdownMenu,
    createPersisted,
    type SelectOption,
    type MenuItem,
  } from '@wonder/components';
  import { Icon, type IconName } from '@wonder/icons';
  import TabbedLayout from '$lib/components/TabbedLayout.svelte';
  import { page } from '$app/state';

  let { children, data } = $props();

  const sidebarCollapsed = createPersisted('sidebar-collapsed', data.sidebarCollapsed);

  const navItems: { href: string; label: string; icon: IconName }[] = [
    { href: '/admin', label: 'Admin', icon: 'clipboard' },
  ];

  const tabs = [
    { label: 'Events', href: '/events' },
    { label: 'Trace', href: '/trace' },
    { label: 'Logs', href: '/logs' },
  ];

  // Demo select
  const demoOptions: SelectOption[] = [
    { value: 'dev', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'prod', label: 'Production' },
  ];
  let demoValue = $state<string | undefined>('dev');

  // Demo dropdown menu
  const menuItems: MenuItem[] = [
    { id: 'new', label: 'New File', onSelect: () => console.log('New File') },
    { id: 'open', label: 'Open...', onSelect: () => console.log('Open') },
    {
      id: 'recent',
      label: 'Open Recent',
      children: [
        { id: 'file1', label: 'project.ts', onSelect: () => console.log('file1') },
        { id: 'file2', label: 'config.json', onSelect: () => console.log('file2') },
        { id: 'file3', label: 'README.md', onSelect: () => console.log('file3') },
      ],
    },
    { id: 'save', label: 'Save', onSelect: () => console.log('Save') },
    { id: 'export', label: 'Export', disabled: true },
  ];
</script>

<div class="flex h-screen">
  <Sidebar
    bind:collapsed={sidebarCollapsed.value}
    class="group flex flex-col w-52 data-collapsed:w-15 h-full p-3 bg-surface-raised border-r border-border transition-[width] duration-200"
  >
    {#snippet trigger(props, collapsed)}
      <button
        {...props}
        class="flex items-center justify-center size-9 hover:bg-surface-hover rounded transition-colors cursor-pointer"
      >
        <Icon name="sidebar" size={20} class="text-foreground-muted" />
      </button>
    {/snippet}

    {#snippet children(collapsed)}
      {#if !collapsed}
        <div class="mt-4 px-1">
          <Select options={demoOptions} bind:value={demoValue}>
            {#snippet trigger(props, selected)}
              <button
                {...props}
                class="flex items-center justify-between w-full px-3 h-9 text-sm rounded border border-border bg-surface hover:bg-surface-hover transition-colors text-left data-[state=open]:ring-2 data-[state=open]:ring-ring"
              >
                <span class="truncate">{selected?.label ?? 'Select environment...'}</span>
                <Icon name="list" size={16} class="shrink-0 text-foreground-muted" />
              </button>
            {/snippet}

            {#snippet listbox(props, children)}
              <div {...props} class="bg-surface border border-border rounded shadow-lg py-1">
                {@render children()}
              </div>
            {/snippet}

            {#snippet option(props, opt, isSelected)}
              <div
                {...props}
                class="px-3 py-2 text-sm cursor-pointer data-highlighted:bg-surface-hover data-selected:font-medium"
              >
                {opt.label}
              </div>
            {/snippet}
          </Select>
        </div>

        <div class="mt-2 px-1">
          <DropdownMenu items={menuItems}>
            {#snippet trigger(props)}
              <button
                {...props}
                class="flex items-center justify-between w-full px-3 h-9 text-sm rounded border border-border bg-surface hover:bg-surface-hover transition-colors text-left data-[state=open]:ring-2 data-[state=open]:ring-ring"
              >
                <span>Actions</span>
                <Icon name="list" size={16} class="shrink-0 text-foreground-muted" />
              </button>
            {/snippet}

            {#snippet content(props, children)}
              <div {...props} class="bg-surface border border-border rounded shadow-lg py-1 z-50">
                {@render children()}
              </div>
            {/snippet}

            {#snippet item(props, menuItem)}
              <div
                {...props}
                class="flex items-center justify-between px-3 py-2 text-sm cursor-pointer data-highlighted:bg-surface-hover data-disabled:opacity-50 data-disabled:cursor-not-allowed"
              >
                <span>{menuItem.label}</span>
                {#if props['data-has-submenu']}
                  <span class="text-foreground-muted">→</span>
                {/if}
              </div>
            {/snippet}
          </DropdownMenu>
        </div>
      {/if}

      <nav class="flex flex-col gap-1 mt-4">
        {#each navItems as item}
          <a
            href={item.href}
            class="flex items-center gap-3 px-2 h-9 rounded hover:bg-surface-hover transition-colors text-foreground-muted hover:text-foreground text-sm"
          >
            <Icon name={item.icon} size={20} class="shrink-0" />
            <span class="opacity-100 group-data-collapsed:opacity-0 transition-opacity duration-200"
              >{item.label}</span
            >
          </a>
        {/each}
      </nav>
    {/snippet}
  </Sidebar>

  <div class="flex-1 overflow-hidden">
    <TabbedLayout {tabs} activeHref={page.url.pathname}>
      {@render children()}
    </TabbedLayout>
  </div>
</div>
