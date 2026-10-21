<script lang="ts">
	import { cn } from '#lib/utils';

	interface Props {
		label: string;
		score: number | null;
		total: number;
	}

	let { label, score, total }: Props = $props();

	const tier = $derived(score === null ? null : score >= 15 ? 'jackpot' : score >= 14 ? 'bonus' : score >= 12 ? 'near' : null);
</script>

<div class={cn(
	'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold',
	score === null ? 'bg-muted text-muted-foreground border border-border' : 'bg-lime/10 text-lime-foreground border border-lime/30'
)}>
	<span>{label}</span>
	<span class="font-mono font-black">{score === null ? '—' : `${score}/${total}`}</span>
	{#if tier === 'jackpot'}<span class="text-xs tracking-tighter uppercase">jackpot</span>{/if}
	{#if tier === 'bonus'}<span class="text-xs tracking-tighter uppercase">bonus</span>{/if}
	{#if tier === 'near'}<span class="text-xs tracking-tighter uppercase">near</span>{/if}
</div>
