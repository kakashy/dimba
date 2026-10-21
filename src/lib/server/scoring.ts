import { db } from '#lib/server/db';
import { events, jackpots, predictions } from '#lib/server/db/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { scorePicks } from '#lib/types';

/**
 * Score every unscored prediction whose jackpot is finished and whose events
 * carry results. Called after each weekly scrape/sync.
 * Returns the freshly scored predictions so callers can push notifications.
 */
export async function scoreFinishedPredictions(): Promise<
	Array<{ jackpotId: string; setLabel: 'A' | 'B' | 'C'; score: number }>
> {
	const finished = await db.select({ id: jackpots.id }).from(jackpots).where(sql`${jackpots.status} = 'finished'`);

	if (finished.length === 0) return [];

	const finishedIds = finished.map((j) => j.id);

	const rows = await db
		.select({
			predictionId: predictions.id,
			jackpotId: predictions.jackpotId,
			setLabel: predictions.setLabel,
			picks: predictions.picks,
			eventNumber: events.eventNumber,
			resultPick: events.resultPick
		})
		.from(predictions)
		.innerJoin(events, eq(events.jackpotId, predictions.jackpotId))
		.where(
			and(
				isNull(predictions.score),
				inArray(predictions.jackpotId, finishedIds)
			)
		);

	const byPrediction = new Map<
		string,
		{
			predictionId: string;
			jackpotId: string;
			setLabel: 'A' | 'B' | 'C';
			picks: ('1' | 'X' | '2' | null)[];
			results: ('1' | 'X' | '2' | null)[];
		}
	>();

	for (const row of rows) {
		let entry = byPrediction.get(row.predictionId);
		if (!entry) {
			entry = {
				predictionId: row.predictionId,
				jackpotId: row.jackpotId,
				setLabel: row.setLabel,
				picks: [],
				results: []
			};
			byPrediction.set(row.predictionId, entry);
		}
		const idx = row.eventNumber - 1;
		entry.picks[idx] = row.picks[idx] ?? null;
		entry.results[idx] = row.resultPick ?? null;
	}

	const scored: Array<{ jackpotId: string; setLabel: 'A' | 'B' | 'C'; score: number }> = [];

	for (const entry of byPrediction.values()) {
		const score = scorePicks(entry.picks, entry.results);
		await db
			.update(predictions)
			.set({ score, serverUpdatedAt: new Date() })
			.where(eq(predictions.id, entry.predictionId));
		scored.push({ jackpotId: entry.jackpotId, setLabel: entry.setLabel, score });
	}

	return scored;
}
