<script lang="ts">
	import type { Snippet } from 'svelte';

	interface TriggerProps {
		onclick: () => void;
		'aria-expanded': boolean;
		'aria-controls': string;
	}

	let {
		collapsed = $bindable(false),
		class: className = '',
		trigger,
		children,
	}: {
		collapsed?: boolean;
		class?: string;
		trigger: Snippet<[TriggerProps, boolean]>;
		children: Snippet<[boolean]>;
	} = $props();

	const contentId = crypto.randomUUID();

	function toggle() {
		collapsed = !collapsed;
	}
</script>

<aside
	class={className}
	data-collapsed={collapsed || undefined}
>
	{@render trigger(
		{
			onclick: toggle,
			'aria-expanded': !collapsed,
			'aria-controls': contentId,
		},
		collapsed
	)}
	<div id={contentId}>
		{@render children(collapsed)}
	</div>
</aside>
