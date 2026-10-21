<script lang="ts">
	import { onMount } from 'svelte';
	import { Trophy } from '@lucide/svelte';
import { cn } from '#lib/utils';
	import { db } from '#lib/db/local';
	import type { DbJackpot } from '#lib/db/local';
	import { syncAll, syncAndFlush } from '#lib/sync';
	import { formatPrize, countdown } from '#lib/format';
	import { emptyPicks, type FixtureEvent, type Prediction, type PickValue, SET_LABELS } from '#lib/types';
	import FixtureCard from '#lib/components/FixtureCard.svelte';
	import SaveBar from '#lib/components/SaveBar.svelte';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import ScoreChip from '#lib/components/ScoreChip.svelte';
	import Onboarding from '#lib/components/Onboarding.svelte';

	const browser = typeof window !== 'undefined';

	let refresh = $state(0);
	const bump = () => (refresh += 1);

	let status = $state<'synced' | 'saving' | 'offline' | 'error'>('synced');
	let set = $state<typeof SET_LABELS[number]>('A');
	let saving = $state(false);
	let showOnboarding = $state(true);

	let jackpot = $state<DbJackpot | null>(null);
	let events = $state<FixtureEvent[]>([]);
	let predictions = $state<Record<string, Prediction>>({});

	const readLocal = async () => {
		if (!browser || !db) return;
		const instance = db;
		const rows = await instance.jackpots.where('status').equals('active').sortBy('scrapedAt');
		const jp = rows.reverse()[0];
		if (jp) {
			jackpot = jp;
			events = await instance.events.where('jackpotId').equals(jp.id).sortBy('eventNumber');
			const ps = await instance.predictions.where('jackpotId').equals(jp.id).toArray();
			predictions = Object.fromEntries(ps.map((p) => [p.setLabel, p]));
		} else {
			jackpot = null;
			events = [];
			predictions = {};
		}
	};

	const saveSet = async () => {
		if (!browser || !db || !jackpot) return;
		const row = predictions[set];
		if (!row) return;
		saving = true;
		status = 'saving';
		const instance = db;
		await instance.outbox.where('jackpotId').equals(jackpot.id).and((p) => p.setLabel === set).delete();
		await instance.outbox.add({
			jackpotId: jackpot.id,
			setLabel: set,
			picks: row.picks,
			clientUpdatedAt: new Date(),
			attempts: 0,
			lastError: null
		});
		const { flush } = syncAll;
		await flush();
		saving = false;
		const stillPending = await instance.outbox.count();
		status = stillPending > 0 ? 'offline' : 'synced';
		bump();
	};

	const pick = (eventNumber: number, value: PickValue) => {
		if (!browser || !db || !jackpot) return;
		const row = predictions[set] ?? { id: '', jackpotId: jackpot.id, setLabel: set, picks: emptyPicks(17), score: null, clientUpdatedAt: new Date(), serverUpdatedAt: new Date() };
		const picks = [...row.picks];
		picks[eventNumber - 1] = value;
		const id = row.id ?? crypto.randomUUID();
		const instance = db;
		instance.predictions.put({ id, jackpotId: jackpot.id, setLabel: set, picks, score: null, clientUpdatedAt: new Date(), serverUpdatedAt: new Date() });
		predictions = { ...predictions, [set]: { ...row, picks, id } };
		void saveSet();
	};

	const pickFor = (eventNumber: number): PickValue | null => {
		const row = predictions[set];
		return row?.picks[eventNumber - 1] ?? null;
	};

	const completed = (): number => {
		const row = predictions[set];
		return row ? row.picks.filter((p) => p !== null).length : 0;
	};

	const resultsReady = (): boolean => events.some((e) => e.resultPick !== null);

	const scoreFor = (label: typeof SET_LABELS[number]): number | null => {
		const row = predictions[label];
		return row?.score ?? null;
	};

	$effect(() => {
		void readLocal();
	});

	onMount(async () => {
		if (browser) {
			showOnboarding = !localStorage.getItem('dimba:onboarded');
			window.addEventListener('online', () => void (syncAll.pull(), syncAll.flush()));
		}
		await syncAll.pull();
		await syncAll.flush();
		await readLocal();
		bump();
	});
</script>

<svelte:head>
	<title>Dimba — {jackpot?.name ?? 'Fixtures'}</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<Onboarding
		title="Welcome to Dimba"
		body="Save 3 prediction sets (A, B, C) for this week’s Mega Jackpot Pro. Works offline — saves sync when you’re back online. Results land every Tuesday."
		dismissed={!showOnboarding}
		onDismiss={() => {
			showOnboarding = false;
			localStorage.setItem('dimba:onboarded', '1');
		}}
	/>
	<header class="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30 px-4 py-4">
		<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between gap-4">
			<div>
				<h1 class="font-black tracking-tight text-2xl md:text-3xl">{jackpot?.name ?? 'Fixtures'}</h1>
				<p class="text-base text-muted-foreground tabular-nums">
					{jackpot?.finishedAt ? (countdown(jackpot.finishedAt) ?? 'Round closed') : jackpot ? (countdown(events[0]?.kickoffTime ?? null) ?? 'Fixtures loading…') : 'Fixtures loading…'}
				</p>
			</div>
			<div class="text-right">
				<div class="text-xs uppercase tracking-widest text-muted-foreground">Jackpot</div>
				<div class="font-black text-2xl md:text-3xl tabular-nums text-lime-foreground">{formatPrize(jackpot?.prizeAmount ?? null)}</div>
			</div>
		</div>
		<div class="mt-2 flex items-center gap-2 text-xs">
			<span class={cn('px-2 py-0.5 rounded border', status === 'synced' ? 'border-success text-success-foreground bg-success/10' : status === 'offline' ? 'border-muted text-muted-foreground bg-muted' : 'border-accent text-accent-foreground bg-accent/10')}>
				{status === 'synced' ? 'Synced' : status === 'offline' ? 'Offline — will sync' : status === 'saving' ? 'Saving…' : 'Sync failed'}
			</span>
		</div>
	</header>

	<main class="flex-1 w-full max-w-3xl mx-auto px-4 pb-24">
		{#if jackpot}
			<div class="flex flex-col gap-2">
				{#each SET_LABELS as label (label)}
					<button class={cn(
						'w-full min-h-[56px] rounded-xl border border-border py-3 text-base font-bold transition-colors text-left',
						set === label ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground hover:bg-muted'
					)} onclick={() => (set = label)}>
						<ScoreChip label={label} score={scoreFor(label)} total={17} />
						<span class="ml-auto text-sm text-muted-foreground">{completed()}/17 picked</span>
					</button>
				{/each}
			</div>

			<div class="mt-5 space-y-2">
				{#each events as event (event.eventNumber)}
					<FixtureCard event={event} pick={pickFor(event.eventNumber)} disabled={jackpot.status === 'finished'} onpick={(value) => pick(event.eventNumber, value)} />
				{/each}
				{#if resultsReady()}
					<p class="text-center text-sm text-muted-foreground py-2">Results from SportPesa — compare your picks above.</p>
				{/if}
			</div>

		{#if !resultsReady() && jackpot.status === 'active'}
			<p class="text-center text-sm text-muted-foreground py-4">No results yet — SportPesa validates every Tuesday.</p>
		{/if}
		{:else}
			<div class="mt-24 flex flex-col items-center justify-center text-center rounded-2xl border border-border bg-card p-10">
				<Trophy class="w-20 h-20 text-lime mb-4" />
				<h2 class="font-bold text-xl">No active jackpot yet</h2>
				<p class="text-base text-muted-foreground max-w-xs">New Mega Jackpot Pro fixtures land every week. Save a set and we’ll score it after Tuesday’s results.</p>
				<button class="mt-6 min-h-[56px] rounded-xl bg-primary text-primary-foreground font-bold py-4 text-xl shadow-lg" onclick={() => void syncAndFlush()}>
					Refresh fixtures
				</button>
			</div>
		{/if}
	</main>

	<SaveBar status={status} prize={jackpot?.prizeAmount ?? null} onSave={() => void saveSet()} saving={saving} />
	<BottomNav current="home" />
</div>
