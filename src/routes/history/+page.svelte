<script lang="ts">
	import { db } from '#lib/db/local';
	import { resolve } from '$app/paths';
	import { SET_LABELS, type FixtureEvent, type Prediction } from '#lib/types';
	import ScoreChip from '#lib/components/ScoreChip.svelte';
	import ResultRow from '#lib/components/ResultRow.svelte';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { BookOpen } from '@lucide/svelte';

	let refresh = $state(0);
	const bump = () => (refresh += 1);

	type Round = {
		id: string;
		humanId: number;
		name: string;
		status: string;
		prizeAmount: string | null;
		finishedAt: string | null;
		scrapedAt: string;
		createdAt: string;
		events: FixtureEvent[];
		predictions: Record<string, Prediction>;
	};

	let rounds = $state<Round[]>([]);
	let expanded = $state<Set<string>>(new Set());

	const readLocal = async () => {
		if (typeof window === 'undefined' || !db) return;
		const instance = db;
		rounds = (await instance.jackpots.where('status').equals('finished').sortBy('scrapedAt').then((rows) => rows.reverse())) as unknown as Round[];
		for (const round of rounds) {
			round.events = await instance.events.where('jackpotId').equals(round.id).sortBy('eventNumber');
			const ps = await instance.predictions.where('jackpotId').equals(round.id).toArray();
			round.predictions = Object.fromEntries(ps.map((p) => [p.setLabel, p]));
		}
		bump();
	};

	const toggle = (id: string) => {
		expanded = new Set(expanded.has(id) ? [...expanded].filter((x) => x !== id) : [...expanded, id]);
	};

	const scoreFor = (round: Round, label: typeof SET_LABELS[number]): number | null => {
		return round.predictions?.[label]?.score ?? null;
	};

	const resultsReady = (round: Round): boolean => round.events.some((e: FixtureEvent) => e.resultPick !== null);

	$effect(() => {
		void readLocal();
	});
</script>

<svelte:head>
	<title>Dimba — Results</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-secondary-background text-foreground">
	<header class="border-b border-border bg-background px-4 pt-4 pb-3 sticky top-0 z-20">
		<h1 class="font-bold tracking-tight text-3xl">Results</h1>
		<p class="text-sm text-muted-foreground mt-1">Every set you saved, scored after Tuesday’s results.</p>
	</header>

	<main class="flex-1 w-full max-w-[430px] mx-auto px-4 pb-24">
		{#if rounds.length === 0}
			<div class="mt-24 flex flex-col items-center justify-center text-center rounded-2xl border border-border bg-card p-10">
				<BookOpen class="w-20 h-20 text-primary mb-4" />
				<h2 class="font-bold text-xl">No past rounds yet</h2>
				<p class="text-sm text-muted-foreground max-w-xs">Save predictions for a round and we’ll score it here after SportPesa validates results on Tuesday.</p>
				<a href={resolve('/')} class="mt-6 min-h-[56px] rounded-xl bg-primary text-primary-foreground font-bold py-3 text-base shadow-sm block">Go to fixtures</a>
			</div>
		{:else}
			<div class="space-y-3">
				{#each rounds as round (round.id)}
					<div class="card p-5 gap-3">
						<div class="flex items-center justify-between gap-3 mb-3">
							<div>
								<div class="font-bold text-lg">{round.name ?? 'MEGA Jackpot Pro'}</div>
								<div class="text-xs text-muted-foreground">
									#{round.humanId ?? '—'} · {round.finishedAt ? new Date(round.finishedAt).toLocaleDateString('en-KE') : '—'}
								</div>
							</div>
							<button
								class="rounded-lg border border-border px-3 py-2 text-sm font-semibold transition-colors min-h-[44px]"
								onclick={() => toggle(round.id)}
							>
								{expanded.has(round.id) ? 'Hide results' : 'Show results'}
							</button>
						</div>
						<div class="flex gap-2 mb-3">
							{#each SET_LABELS as label (label)}
								<ScoreChip label={label} score={scoreFor(round, label)} total={17} />
							{/each}
						</div>
						{#if expanded.has(round.id)}
							<div class="space-y-1">
								{#each round.events as event (event.eventNumber)}
									<ResultRow
										num={event.eventNumber}
										home={event.home}
										away={event.away}
										picks={round.predictions ? { A: (round.predictions.A?.picks ?? [])[event.eventNumber - 1], B: (round.predictions.B?.picks ?? [])[event.eventNumber - 1], C: (round.predictions.C?.picks ?? [])[event.eventNumber - 1] } : { A: null, B: null, C: null }}
										actual={event.resultPick}
										score={event.score}
									/>
								{/each}
							</div>
							{#if !resultsReady(round)}
								<p class="mt-2 text-xs text-muted-foreground">Awaiting official results — checked every Tuesday.</p>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</main>

	<BottomNav current="history" />
</div>
