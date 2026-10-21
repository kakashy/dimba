import type { CurrentJackpotResponse, HistoryResponse, Prediction } from '#lib/types';
import { db } from './db/local';

type PendingPrediction = { jackpotId: string; setLabel: 'A' | 'B' | 'C'; picks: ('1' | 'X' | '2' | null)[]; clientUpdatedAt: Date };

async function getJSON<T>(path: string): Promise<T> {
	const res = await fetch(path, { credentials: 'include', headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`${path} → ${res.status}`);
	return (await res.json()) as T;
}

/** Fetch current + history from the API and merge into Dexie. Never throws to the caller. */
export async function pullRemote(): Promise<{ jackpots: number; events: number; predictions: number }> {
	const instance = db;
	if (!instance) return { jackpots: 0, events: 0, predictions: 0 };

	let jackpots = 0;
	let events = 0;
	let predictions = 0;

	let current: CurrentJackpotResponse;
	let history: HistoryResponse;
	try {
		[current, history] = await Promise.all([
			getJSON<CurrentJackpotResponse>('/api/jackpot/current'),
			getJSON<HistoryResponse>('/api/jackpot/history')
		]);
	} catch {
		// Offline or API down — local data stays intact.
		return { jackpots: 0, events: 0, predictions: 0 };
	}

	const seenJackpotIds = new Set<string>();
	const upsertJackpot = (j: CurrentJackpotResponse['jackpot'] | null) => {
		if (!j) return;
		seenJackpotIds.add(j.id);
		instance.jackpots.put({
			id: j.id,
			humanId: j.humanId,
			name: j.name,
			status: j.status,
			prizeAmount: j.prizeAmount,
			finishedAt: j.finishedAt ? new Date(j.finishedAt) : null,
			scrapedAt: new Date(j.scrapedAt),
			createdAt: new Date(j.createdAt)
		});
		jackpots += 1;
	};
	upsertJackpot(current.jackpot);
	for (const entry of history.jackpots) upsertJackpot(entry.jackpot);

	const upsertEvents = (evts: CurrentJackpotResponse['events'], jackpotId: string) => {
		for (const e of evts) {
			instance.events.put({
				id: e.id,
				jackpotId,
				eventNumber: e.eventNumber,
				kickoffTime: e.kickoffTime ? new Date(e.kickoffTime) : null,
				home: e.home,
				away: e.away,
				oddsHome: e.oddsHome,
				oddsDraw: e.oddsDraw,
				oddsAway: e.oddsAway,
				resultPick: e.resultPick,
				score: e.score
			});
		}
		events += evts.length;
	};
	if (current.jackpot) upsertEvents(current.events, current.jackpot.id);
	for (const entry of history.jackpots) upsertEvents(entry.events, entry.jackpot.id);

	// Predictions: server state wins unless a local outbox item is pending.
	const pending = await instance.outbox.toArray();
	const pendingByKey = new Map<string, PendingPrediction>();
	for (const p of pending) {
		pendingByKey.set(`${p.jackpotId}|${p.setLabel}`, p);
	}
	const upsertPrediction = (p: Prediction, jackpotId: string, setLabel: Prediction['setLabel']) => {
		const key = `${jackpotId}|${setLabel}`;
		const local = pendingByKey.get(key);
		instance.predictions.put({
			id: p.id,
			jackpotId,
			setLabel,
			picks: local?.picks ?? p.picks,
			score: p.score ?? null,
			clientUpdatedAt: local?.clientUpdatedAt ?? new Date(p.clientUpdatedAt),
			serverUpdatedAt: new Date(p.serverUpdatedAt)
		});
		predictions += 1;
	};
	if (current.jackpot) {
		for (const [setLabel, p] of Object.entries(current.predictions ?? {})) {
			if (p) upsertPrediction(p, current.jackpot.id, setLabel as Prediction['setLabel']);
		}
	}
	for (const entry of history.jackpots) {
		for (const [setLabel, p] of Object.entries(entry.predictions ?? {})) {
			if (p) upsertPrediction(p, entry.jackpot.id, setLabel as Prediction['setLabel']);
		}
	}

	return { jackpots, events, predictions };
}

let syncRunning = false;

/** Retry pending outbox items against the API. Stops on first network failure. */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
	const instance = db;
	if (!instance) return { sent: 0, failed: 0 };
	if (syncRunning) return { sent: 0, failed: 0 };
	syncRunning = true;
	let sent = 0;
	let failed = 0;
	try {
		const queue = await instance.outbox.orderBy('id').toArray();
		for (const item of queue) {
			try {
				const res = await fetch('/api/predictions', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jackpotId: item.jackpotId,
						setLabel: item.setLabel,
						picks: item.picks,
						clientUpdatedAt: item.clientUpdatedAt
					})
				});
				if (res.status === 409) {
					await instance.outbox.delete(item.id!);
					sent += 1;
					continue;
				}
				if (!res.ok) {
					await instance.outbox.update(item.id!, { attempts: Number(item.attempts ?? 0) + 1, lastError: `HTTP ${res.status}` });
					failed += 1;
					break;
				}
				await instance.outbox.delete(item.id!);
				sent += 1;
			} catch (err) {
				await instance.outbox.update(item.id!, { attempts: Number(item.attempts ?? 0) + 1, lastError: (err as Error).message });
				failed += 1;
				break;
			}
		}
	} finally {
		syncRunning = false;
	}
	return { sent, failed };
}

/** Pull remote state and flush the local outbox, in sequence. */
export async function syncAndFlush() {
	const [pull, flush] = await Promise.all([pullRemote(), flushOutbox()]);
	return { pull, flush };
}

/** Expose the individual steps for callers that want finer control. */
export const syncAll = { pull: pullRemote, flush: flushOutbox };
