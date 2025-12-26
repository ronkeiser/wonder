<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.project.name}</title>
</svelte:head>

<div class="p-6">
	<h1 class="text-xl font-semibold mb-2">{data.project.name}</h1>
	{#if data.project.description}
		<p class="text-foreground-muted text-sm mb-6">{data.project.description}</p>
	{/if}

	<dl class="grid gap-4 text-sm">
		<div>
			<dt class="text-foreground-subtle text-xs">ID</dt>
			<dd class="font-mono">{data.project.id}</dd>
		</div>
		<div>
			<dt class="text-foreground-subtle text-xs">Workspace ID</dt>
			<dd class="font-mono">{data.project.workspaceId}</dd>
		</div>
		<div>
			<dt class="text-foreground-subtle text-xs">Created</dt>
			<dd>{new Date(data.project.createdAt).toLocaleString()}</dd>
		</div>
		<div>
			<dt class="text-foreground-subtle text-xs">Updated</dt>
			<dd>{new Date(data.project.updatedAt).toLocaleString()}</dd>
		</div>
	</dl>
</div>
