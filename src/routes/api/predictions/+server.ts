import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '#lib/server/db';
import { events, jackpots, predictions } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Prediction } from '#lib/types';

const bodySchema = z.object({
	jackpotId: z.string().uuid(),
	setLabel: z.enum(['A', 'B', 'C']),
	picks: z
		.array(z.union([z.literal('1'), z.literal('X'), z.literal('2'), z.null()]))
		.min(1)
		.max(34),
	clientUpdatedAt: z.string().datetime().optional()
});

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
	}
	const { jackpotId, setLabel, picks, clientUpdatedAt } = parsed.data;

	const [jackpot, eventRows] = await Promise.all([
		db.select().from(jackpots).where(eq(jackpots.id, jackpotId)).limit(1),
		db.select({ eventNumber: events.eventNumber }).from(events).where(eq(events.jackpotId, jackpotId))
	]);

	if (jackpot.length === 0) {
		return json({ error: 'Unknown jackpot' }, { status: 404 });
	}
	if (eventRows.length > 0 && picks.length !== eventRows.length) {
		return json(
			{ error: `Expected ${eventRows.length} picks, received ${picks.length}` },
			{ status: 400 }
		);
	}
	if (jackpot[0].status === 'finished') {
		return json({ error: 'This round is already closed' }, { status: 409 });
	}

	const row = await db
		.insert(predictions)
		.values({
			jackpotId,
			setLabel,
			picks,
			clientUpdatedAt: clientUpdatedAt ? new Date(clientUpdatedAt) : new Date(),
			serverUpdatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [predictions.jackpotId, predictions.setLabel],
			set: { picks, clientUpdatedAt: clientUpdatedAt ? new Date(clientUpdatedAt) : new Date(), serverUpdatedAt: new Date() }
		})
		.returning();

	return json({ prediction: row[0] as Prediction });
};
