<script lang="ts">
	import { icons, type IconName } from './icons.js';

	let {
		name,
		size = 20,
		class: className = '',
	}: {
		name: IconName;
		size?: number;
		class?: string;
	} = $props();

	const svg = $derived(icons[name]);
</script>

<span class={className} style="width: {size}px; height: {size}px; display: inline-block;">
	{@html svg}
</span>
