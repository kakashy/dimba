/**
 * Sync payload: types, zod validation, builder, POST with retries.
 * The Dimba app owns DB writes / scoring / notifications; we only deliver JSON.
 */
import { z } from 'zod';
import { log } from './log.js';
import type { CurrentEvent, DetailsEvent, HistoryEntry } from './sportpesa.js';

export interface SyncPayload {
	scrapedAt: string;
	source: { pageUrl: string; method: 'dom' | 'api' };
	current: {
		humanId: number;
		name: string;
		prizeAmount: string | null;
		events: Array<{
			eventNumber: number;
			kickoffTime: string | null;
			home: string;
			away: string;
			oddsHome?: string | null;
			oddsDraw?: string | null;
			oddsAway?: string | null;
		}>;
	} | null;
	finished: Array<{
		jackpotId: string;
		humanId: number;
		finishedAt: string | null;
		prizeAmount: string | null;
		events: Array<{
			eventNumber: number;
			kickoffTime: string | null;
			home: string;
			away: string;
			resultPick: '1' | 'X' | '2' | null;
			score: string | null;
		}>;
	}>;
	run: { status: 'ok' | 'error'; message: string | null };
}

export const syncPayloadSchema = z.object({
	scrapedAt: z.string(),
	source: z.object({ pageUrl: z.string(), method: z.enum(['dom', 'api']) }),
	current: z
		.object({
			humanId: z.number().int().nonnegative(),
			name: z.string(),
			prizeAmount: z.string().nullable(),
			events: z
				.array(
					z.object({
						eventNumber: z.number().int().positive(),
						kickoffTime: z.string().nullable(),
						home: z.string(),
						away: z.string(),
						oddsHome: z.string().nullish(),
						oddsDraw: z.string().nullish(),
						oddsAway: z.string().nullish()
					})
				)
				.min(1)
		})
		.nullable(),
	finished: z.array(
		z.object({
			jackpotId: z.string().min(1),
			humanId: z.number().int().nonnegative(),
			finishedAt: z.string().nullable(),
			prizeAmount: z.string().nullable(),
			events: z.array(
				z.object({
					eventNumber: z.number().int().nonnegative(),
					kickoffTime: z.string().nullable(),
					home: z.string(),
					away: z.string(),
					resultPick: z.enum(['1', 'X', '2']).nullable(),
					score: z.string().nullable()
				})
			)
		})
	),
	run: z.object({ status: z.enum(['ok', 'error']), message: z.string().nullable() })
});

export interface BuildPayloadInput {
	pageUrl: string;
	method: 'dom' | 'api';
	current: { humanId?: number; name?: string; prizeAmount: string | null; events: CurrentEvent[] } | null;
	finished: Array<{ entry: HistoryEntry; prizeAmount: string | null; events: DetailsEvent[] }>;
	errors: string[];
	now?: Date;
}

export function buildPayload(input: BuildPayloadInput): SyncPayload {
	const scrapedAt = (input.now ?? new Date()).toISOString();
	const errors = input.errors.filter((e) => e.trim() !== '');

	let current: SyncPayload['current'] = null;
	if (input.current && input.current.events.length > 0) {
		current = {
			humanId: input.current.humanId ?? 0,
			name: input.current.name ?? 'MEGA Jackpot Pro',
			prizeAmount: input.current.prizeAmount,
			events: input.current.events.map((e) => ({
				eventNumber: e.eventNumber,
				kickoffTime: e.kickoffTime,
				home: e.home,
				away: e.away,
				oddsHome: e.oddsHome,
				oddsDraw: e.oddsDraw,
				oddsAway: e.oddsAway
			}))
		};
	} else {
		errors.push('current fixtures unavailable');
	}

	const finished = input.finished.map((f) => ({
		jackpotId: f.entry.jackpotId,
		humanId: f.entry.humanId,
		finishedAt: f.entry.finishedAt,
		prizeAmount: f.prizeAmount,
		events: f.events.map((e) => ({
			eventNumber: e.eventNumber,
			kickoffTime: e.kickoffTime,
			home: e.home,
			away: e.away,
			resultPick: e.resultPick,
			score: e.score
		}))
	}));

	const status: 'ok' | 'error' = errors.length > 0 ? 'error' : 'ok';
	return {
		scrapedAt,
		source: { pageUrl: input.pageUrl, method: current !== null ? input.method : 'dom' },
		current,
		finished,
		run: { status, message: status === 'error' ? errors.join('; ') : null }
	};
}

export function validatePayload(payload: SyncPayload): SyncPayload {
	return syncPayloadSchema.parse(payload);
}

export interface PostResult {
	ok: boolean;
	status: number | null;
	message: string;
}

export interface PostOptions {
	appSyncUrl: string;
	secret: string;
	retries: number;
	backoffMs: number;
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status: number): boolean {
	return status >= 500 || status === 429;
}

/**
 * POST the payload to ${APP_SYNC_URL}/api/internal/sync with retries/backoff.
 * Never logs the secret. Retries on network errors and 5xx/429.
 */
export async function postSync(payload: SyncPayload, opts: PostOptions): Promise<PostResult> {
	const doFetch = opts.fetchImpl ?? fetch;
	const sleep = opts.sleep ?? defaultSleep;
	const url = `${opts.appSyncUrl.replace(/\/+$/, '')}/api/internal/sync`;
	let validated: SyncPayload;
	try {
		validated = validatePayload(payload);
	} catch (err) {
		return { ok: false, status: null, message: `payload validation failed: ${(err as Error).message}` };
	}

	let lastMessage = 'unknown error';
	for (let attempt = 1; attempt <= opts.retries; attempt += 1) {
		try {
			const res = await doFetch(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-internal-secret': opts.secret
				},
				body: JSON.stringify(validated)
			});
			if (res.ok) {
				log.info('sync', `POST ${url} → ${res.status}`);
				return { ok: true, status: res.status, message: 'delivered' };
			}
			const bodyText = await res.text().catch(() => '');
			lastMessage = `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`;
			log.warn('sync', `POST attempt ${attempt}/${opts.retries} failed (${lastMessage})`);
			if (!shouldRetryStatus(res.status)) {
				return { ok: false, status: res.status, message: lastMessage };
			}
		} catch (err) {
			lastMessage = `network error: ${(err as Error).message}`;
			log.warn('sync', `POST attempt ${attempt}/${opts.retries} failed (${lastMessage})`);
		}
		if (attempt < opts.retries) {
			await sleep(opts.backoffMs * 2 ** (attempt - 1));
		}
	}
	return { ok: false, status: null, message: `retries exhausted: ${lastMessage}` };
}
