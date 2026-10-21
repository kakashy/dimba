<script lang="ts">
	import { cn } from '#lib/utils';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Pick = '1' | 'X' | '2';

	const LABELS: Record<Pick, string> = { '1': 'HOME', X: 'DRAW', '2': 'AWAY' };

	interface Props extends Omit<HTMLButtonAttributes, 'onClick'> {
		value: Pick;
		label?: string;
		selected: boolean;
		disabled?: boolean;
		onpick: (value: Pick) => void;
	}

	let { value, label = LABELS[value], selected = false, disabled = false, onpick }: Props = $props();

	function pick() {
		if (disabled) return;
		onpick(value);
	}
</script>

<button class={cn(
	'flex-1 rounded-xl border border-transparent bg-clip-padding text-sm font-bold transition-all outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-40',
	selected
		? 'bg-primary text-primary-foreground shadow-lg ring-3 ring-primary/30'
		: 'border-border bg-background text-foreground hover:bg-muted hover:text-foreground'
)} aria-pressed={selected} disabled={disabled} onclick={pick}>
	<span class="font-black tracking-tighter uppercase">{label}</span>
</button>
