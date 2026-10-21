<script lang="ts">
	import { cn } from '#lib/utils';

	interface Props {
		num: number;
		home: string;
		away: string;
		picks: Record<'A' | 'B' | 'C', '1' | 'X' | '2' | null>;
		actual: '1' | 'X' | '2' | null;
		score: string | null;
	}

	let { num, home, away, picks, actual, score }: Props = $props();

	const pickLabel = (v: '1' | 'X' | '2' | null) => (v === null ? '—' : v === '1' ? 'HOME' : v === 'X' ? 'DRAW' : 'AWAY');
	const pickClass = (v: '1' | 'X' | '2' | null) => {
		if (actual === null) return 'text-muted-foreground';
		return v === actual ? 'text-success-foreground font-bold' : 'text-destructive-foreground font-bold';
	};
</script>

<div class="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-card">
	<div class="flex-1 text-base font-bold tabular-nums">{String(num).padStart(2, '0')}. {home} vs {away}</div>
	<div class="flex items-center gap-1.5 text-sm font-mono">
		{#each Object.entries(picks) as [label, pick] (label)}
			<span class={cn('px-2 py-1 rounded-lg', actual === null ? 'bg-muted' : pick === actual ? 'bg-success/20' : 'bg-destructive/20')}>
				{label}: <span class={pickClass(pick)}>{pickLabel(pick)}</span>
			</span>
		{/each}
	</div>
	<div class="w-12 text-center">
		{#if actual === null}<span class="text-muted-foreground text-sm">—</span>
		{:else}<span class={cn('font-bold text-sm', score ? 'text-success-foreground' : 'text-foreground')}>{actual}</span>{/if}
	</div>
</div>
