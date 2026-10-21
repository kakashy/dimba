<script lang="ts">
	import { formatKickoff } from '#lib/format';
	import type { FixtureEvent, PickValue } from '#lib/types';

	interface Props {
		event: FixtureEvent;
		pick: PickValue | null;
		disabled?: boolean;
		onpick: (value: PickValue) => void;
	}

	let { event, pick, disabled = false, onpick }: Props = $props();
	import PickButton from '#lib/components/ui/PickButton.svelte';
</script>

<div class="card p-4 gap-3">
	<div class="flex items-center gap-3">
		<span class="font-mono font-bold text-xs text-muted-foreground">{String(event.eventNumber).padStart(2, '0')}</span>
		<span class="flex-1 text-muted-foreground text-sm tabular-nums">{formatKickoff(event.kickoffTime)}</span>
		<span class="text-xs font-semibold">{event.resultPick ? `✓ ${event.resultPick}` : '—'}</span>
	</div>
	<div class="grid grid-cols-2 gap-1 text-sm font-bold text-foreground">
		<span>{event.home}</span>
		<span>{event.away}</span>
	</div>
	<div class="flex gap-1 text-xs text-muted-foreground">
		{#if event.oddsHome}<span class="rounded px-1.5 bg-muted">{event.home.slice(0, 1)} {event.oddsHome}</span>{/if}
		{#if event.oddsDraw}<span class="rounded px-1.5 bg-muted">X {event.oddsDraw}</span>{/if}
		{#if event.oddsAway}<span class="rounded px-1.5 bg-muted">{event.away.slice(0, 1)} {event.oddsAway}</span>{/if}
	</div>
	<div class="grid grid-cols-3 gap-1 pt-1">
		<PickButton value="1" selected={pick === '1'} disabled={disabled} label={event.home.slice(0, 6)} onpick={onpick} />
		<PickButton value="X" selected={pick === 'X'} disabled={disabled} label="DRAW" onpick={onpick} />
		<PickButton value="2" selected={pick === '2'} disabled={disabled} label={event.away.slice(0, 6)} onpick={onpick} />
	</div>
</div>
