<script lang="ts">
	import { cn } from '#lib/utils';
	import { formatKickoff } from '#lib/format';
	import type { FixtureEvent, PickValue } from '#lib/types';
	import PickButton from '#lib/components/ui/PickButton.svelte';

	interface Props {
		event: FixtureEvent;
		pick: PickValue | null;
		disabled?: boolean;
		onpick: (value: PickValue) => void;
	}

	let { event, pick, disabled = false, onpick }: Props = $props();

	const PICK_LABEL: Record<PickValue, string> = { '1': 'HOME', X: 'DRAW', '2': 'AWAY' };
	const resultLabel = event.resultPick ? PICK_LABEL[event.resultPick] : null;
</script>

<div class="card p-6 gap-4">
	<div class="flex items-center gap-3">
		<span class="font-mono font-semibold text-sm text-foreground">{String(event.eventNumber).padStart(2, '0')}</span>
		<span class="flex-1 text-base tabular-nums text-foreground">{formatKickoff(event.kickoffTime)}</span>
		<span class={cn('font-bold text-sm', resultLabel ? 'text-success-foreground' : 'text-muted-foreground')}>
			{resultLabel ?? '—'}
		</span>
	</div>
	<div class="grid grid-cols-2 gap-2 text-2xl font-bold text-foreground">
		<span>{event.home}</span>
		<span>{event.away}</span>
	</div>
	<div class="flex gap-2">
		{#if event.oddsHome}<span class="rounded-xl px-3 py-1 text-sm font-bold bg-muted">{event.home.slice(0, 3)} {event.oddsHome}</span>{/if}
		{#if event.oddsDraw}<span class="rounded-xl px-3 py-1 text-sm font-bold bg-muted">X {event.oddsDraw}</span>{/if}
		{#if event.oddsAway}<span class="rounded-xl px-3 py-1 text-sm font-bold bg-muted">{event.away.slice(0, 3)} {event.oddsAway}</span>{/if}
	</div>
	<div class="grid grid-cols-3 gap-2">
		<PickButton value="1" selected={pick === '1'} disabled={disabled} onpick={onpick} />
		<PickButton value="X" selected={pick === 'X'} disabled={disabled} onpick={onpick} />
		<PickButton value="2" selected={pick === '2'} disabled={disabled} onpick={onpick} />
	</div>
</div>
