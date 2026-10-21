import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { INTERNAL_SYNC_SECRET } from '$app/env/private';
import { db } from '#lib/server/db';
import { events, jackpots, scrapeRuns } from '#lib/server/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { scoreFinishedPredictions } from '#lib/server/scoring';
import { broadcastPush } from '#lib/server/push';

const eventSchema = z.object({
	eventNumber: z.number().int().positive(),
	kickoffTime: z.string().nullable(),
	home: z.string().min(1),
	away: z.string().min(1),
	oddsHome: z.string().nullish(),
	oddsDraw: z.string().nullish(),
	oddsAway: z.string().nullish(),
	resultPick: z.enum(['1', 'X', '2']).nullish(),
	score: z.string().nullish()
});

const finishedSchema = z.object({
	jackpotId: z.string().uuid(),
	humanId: z.number().int().nonnegative(),
	finishedAt: z.string().nullable(),
	prizeAmount: z.string().nullable(),
	events: z.array(eventSchema).min(1)
});

const currentSchema = z.object({
	humanId: z.number().int().nonnegative(),
	name: z.string().min(1),
	prizeAmount: z.string().nullable(),
	events: z.array(eventSchema).min(1)
});

const bodySchema = z.object({
	scrapedAt: z.string().datetime(),
	source: z.object({ pageUrl: z.string().url(), method: z.enum(['dom', 'api']) }),
	current: z.nullable(currentSchema),
	finished: z.array(finishedSchema),
	run: z.object({ status: z.enum(['ok', 'error']), message: z.string().nullable() })
});

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
	if (request.headers.get('x-internal-secret') !== INTERNAL_SYNC_SECRET) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
	}
	const { scrapedAt, source, current, finished, run } = parsed.data;
	const now = new Date();

	let jackpotsUpserted = 0;
	const errors: string[] = [];

	const upsertJackpot = async (values: {
		id?: string;
		humanId: number;
		status: 'active' | 'finished';
		name: string;
		prizeAmount: string | null;
		finishedAt: Date | null;
		scrapedAt: Date;
	}) => {
		if (values.humanId > 0) {
			const row = await db
				.insert(jackpots)
				.values({
					humanId: values.humanId,
					status: values.status,
					name: values.name,
					prizeAmount: values.prizeAmount,
					finishedAt: values.finishedAt,
					scrapedAt: values.scrapedAt
				})
				.onConflictDoUpdate({
					target: jackpots.humanId,
					set: {
						status: values.status,
						name: values.name,
						prizeAmount: values.prizeAmount,
						finishedAt: values.finishedAt,
						scrapedAt: values.scrapedAt
					}
				})
				.returning({ id: jackpots.id, humanId: jackpots.humanId });
			jackpotsUpserted += 1;
			return row[0];
		}
		const existing = await db
			.select()
			.from(jackpots)
			.where(and(eq(jackpots.humanId, 0), eq(jackpots.status, 'active')))
			.limit(1);
		if (existing.length > 0) {
			await db
				.update(jackpots)
				.set({
					status: values.status,
					name: values.name,
					prizeAmount: values.prizeAmount,
					finishedAt: values.finishedAt,
					scrapedAt: values.scrapedAt
				})
				.where(eq(jackpots.id, existing[0].id));
			jackpotsUpserted += 1;
			return { id: existing[0].id, humanId: 0 };
		}
		const row = await db
			.insert(jackpots)
			.values({
				humanId: 0,
				status: values.status,
				name: values.name,
				prizeAmount: values.prizeAmount,
				finishedAt: values.finishedAt,
				scrapedAt: values.scrapedAt
			})
			.returning({ id: jackpots.id, humanId: jackpots.humanId });
		jackpotsUpserted += 1;
		return row[0];
	};

	const replaceEvents = async (jackpotId: string, evts: z.infer<typeof currentSchema>['events']) => {
		await db.delete(events).where(eq(events.jackpotId, jackpotId));
		if (evts.length > 0) {
			await db.insert(events).values(
				evts.map((e) => ({
					jackpotId,
					eventNumber: e.eventNumber,
					kickoffTime: e.kickoffTime ? new Date(e.kickoffTime) : null,
					home: e.home,
					away: e.away,
					oddsHome: e.oddsHome ?? null,
					oddsDraw: e.oddsDraw ?? null,
					oddsAway: e.oddsAway ?? null,
					resultPick: e.resultPick ?? null,
					score: e.score ?? null
				}))
			);
		}
	};

	// --- Current round -------------------------------------------------------
	let currentJackpotId: string | null = null;
	if (current !== null) {
		const row = await upsertJackpot({
			humanId: current.humanId,
			status: 'active',
			name: current.name,
			prizeAmount: current.prizeAmount,
			finishedAt: null,
			scrapedAt: new Date(scrapedAt)
		});
		currentJackpotId = row.id;
		await replaceEvents(currentJackpotId, current.events);
	}

	// --- Finished rounds -----------------------------------------------------
	const finishedJackpotIds: string[] = [];
	for (const round of finished) {
		const row = await upsertJackpot({
			humanId: round.humanId,
			status: 'finished',
			name: current ? current.name : 'MEGA Jackpot Pro',
			prizeAmount: round.prizeAmount,
			finishedAt: round.finishedAt ? new Date(round.finishedAt) : null,
			scrapedAt: new Date(scrapedAt)
		});
		finishedJackpotIds.push(row.id);
		await replaceEvents(row.id, round.events);
	}

	// Mark any still-active jackpot whose fixtures are all in the past as finished.
	const stale = await db
		.select({ id: jackpots.id })
		.from(jackpots)
		.where(
			and(
				eq(jackpots.status, 'active'),
				isNotNull(jackpots.humanId),
				sql`NOT EXISTS (SELECT 1 FROM ${events} WHERE ${events.jackpotId} = ${jackpots.id} AND ${events.kickoffTime} > ${now})`
			)
		);
	for (const row of stale) {
		await db.update(jackpots).set({ status: 'finished', finishedAt: now }).where(eq(jackpots.id, row.id));
		finishedJackpotIds.push(row.id);
	}

	// --- Score predictions ---------------------------------------------------
	const scored = await scoreFinishedPredictions();

	// --- Scrape run record ---------------------------------------------------
	await db.insert(scrapeRuns).values({
		status: run.status,
		message: run.message,
		jackpotsUpserted
	});

	// --- Push notifications (best effort) ------------------------------------
	let pushResult;
	if (scored.length > 0) {
		const byJackpot = new Map<string, { setLabels: string[]; scores: number[] }>();
		for (const s of scored) {
			const e = byJackpot.get(s.jackpotId) ?? { setLabels: [], scores: [] };
			e.setLabels.push(s.setLabel);
			e.scores.push(s.score);
			byJackpot.set(s.jackpotId, e);
		}
		const bodies = Array.from(byJackpot.values()).map((v) => `Set ${v.setLabels.join(',')}: ${v.scores.join('/')}`);
		const jackpotName = current ? current.name : 'Mega Jackpot Pro';
		pushResult = await broadcastPush({
			title: `Dimba — ${jackpotName} results`,
			body: bodies.join(' · '),
			url: '/history'
		});
	}

	return json({
		ok: true,
		scrapedAt,
		source,
		jackpotsUpserted,
		currentJackpotId,
		finishedCount: finishedJackpotIds.length,
		scoredCount: scored.length,
		errors,
		pushSent: pushResult?.sent ?? 0,
		pushPruned: pushResult?.pruned ?? 0
	});
};
