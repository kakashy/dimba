import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db';
import { events, jackpots, predictions } from '#lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import type { CurrentJackpotResponse, FixtureEvent, Jackpot, Prediction } from '#lib/types';

export const GET: RequestHandler = async (): Promise<Response> => {
	const [active, finished] = await Promise.all([
		db.select().from(jackpots).where(eq(jackpots.status, 'active')).orderBy(desc(jackpots.humanId)).limit(1),
		db
			.select()
			.from(jackpots)
			.where(eq(jackpots.status, 'finished'))
			.orderBy(desc(jackpots.humanId))
			.limit(1)
	]);

	const jackpot = active[0] ?? finished[0] ?? null;
	if (!jackpot) {
		return json({ jackpot: null, events: [], predictions: {} } satisfies CurrentJackpotResponse);
	}

	const [eventRows, predictionRows] = await Promise.all([
		db
			.select()
			.from(events)
			.where(eq(events.jackpotId, jackpot.id))
			.orderBy(events.eventNumber),
		db.select().from(predictions).where(eq(predictions.jackpotId, jackpot.id))
	]);

	const preds = Object.fromEntries(predictionRows.map((p) => [p.setLabel, p])) as Partial<
		Record<Prediction['setLabel'], Prediction>
	>;

	return json({
		jackpot: jackpot as Jackpot,
		events: eventRows as FixtureEvent[],
		predictions: preds
	} satisfies CurrentJackpotResponse);
};
