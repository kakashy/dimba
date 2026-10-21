import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db';
import { events, jackpots, predictions } from '#lib/server/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import type { HistoryJackpotEntry, HistoryResponse } from '#lib/types';

export const GET: RequestHandler = async (): Promise<Response> => {
	const finished = await db
		.select()
		.from(jackpots)
		.where(eq(jackpots.status, 'finished'))
		.orderBy(desc(jackpots.humanId))
		.limit(20);

	if (finished.length === 0) {
		return json({ jackpots: [] } satisfies HistoryResponse);
	}

	const ids = finished.map((j) => j.id);
	const [eventRows, predictionRows] = await Promise.all([
		db.select().from(events).where(inArray(events.jackpotId, ids)).orderBy(events.eventNumber),
		db.select().from(predictions).where(inArray(predictions.jackpotId, ids))
	]);

	const jackpotsOut: HistoryJackpotEntry[] = finished.map((j) => ({
		jackpot: j,
		events: eventRows.filter((e) => e.jackpotId === j.id),
		predictions: Object.fromEntries(
			predictionRows.filter((p) => p.jackpotId === j.id).map((p) => [p.setLabel, p])
		)
	}));

	return json({ jackpots: jackpotsOut } satisfies HistoryResponse);
};
