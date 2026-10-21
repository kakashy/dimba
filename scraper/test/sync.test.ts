import { describe, expect, it } from 'vitest';
import { buildPayload, postSync, validatePayload, type SyncPayload } from '../src/sync.js';
import type { CurrentEvent, DetailsEvent, HistoryEntry } from '../src/sportpesa.js';

const events: CurrentEvent[] = [
	{
		eventNumber: 1,
		kickoffTime: '2026-10-16T17:00:00.000Z',
		kickoffRaw: '16/10/26 - 20:00',
		home: 'Gor Mahia',
		away: 'AFC Leopards',
		oddsHome: '2.29',
		oddsDraw: '3.50',
		oddsAway: '2.50'
	},
	{
		eventNumber: 2,
		kickoffTime: null,
		kickoffRaw: null,
		home: 'Tusker FC',
		away: 'KCB FC',
		oddsHome: null,
		oddsDraw: null,
		oddsAway: null
	}
];

const entry: HistoryEntry = {
	jackpotId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
	humanId: 1287,
	status: 'Finished',
	finishedAt: '2026-10-13T18:30:00.000Z',
	prizeAmount: null
};

const details: DetailsEvent[] = [
	{
		eventNumber: 1,
		kickoffTime: '2026-10-10T14:00:00.000Z',
		home: 'Gor Mahia',
		away: 'AFC Leopards',
		resultPick: '1',
		score: '2:1'
	}
];

function okPayload(): SyncPayload {
	return buildPayload({
		pageUrl: 'https://www.ke.sportpesa.com/en/mega-jackpot-pro',
		method: 'dom',
		current: { humanId: 1288, name: 'MEGA Jackpot Pro', prizeAmount: '136670310', events },
		finished: [{ entry, prizeAmount: null, events: details }],
		errors: [],
		now: new Date('2026-10-21T06:00:00.000Z')
	});
}

describe('buildPayload', () => {
	it('builds a valid payload matching the sync contract', () => {
		const payload = okPayload();
		expect(payload.scrapedAt).toBe('2026-10-21T06:00:00.000Z');
		expect(payload.source.method).toBe('dom');
		expect(payload.current?.humanId).toBe(1288);
		expect(payload.current?.events).toHaveLength(2);
		expect(payload.finished[0]!.jackpotId).toBe(entry.jackpotId);
		expect(payload.finished[0]!.events[0]!.resultPick).toBe('1');
		expect(payload.run).toEqual({ status: 'ok', message: null });
		expect(() => validatePayload(payload)).not.toThrow();
	});

	it('marks run.status=error and current=null when fixtures are missing', () => {
		const payload = buildPayload({
			pageUrl: 'https://www.ke.sportpesa.com/en/mega-jackpot-pro',
			method: 'dom',
			current: { prizeAmount: null, events: [] },
			finished: [],
			errors: ['challenge attempt 1: timeout']
		});
		expect(payload.current).toBeNull();
		expect(payload.run.status).toBe('error');
		expect(payload.run.message).toContain('challenge attempt 1');
		expect(payload.run.message).toContain('current fixtures unavailable');
		expect(() => validatePayload(payload)).not.toThrow();
	});

	it('rejects an invalid payload via schema', () => {
		const bad = { ...okPayload(), scrapedAt: 123 };
		expect(() => validatePayload(bad as unknown as SyncPayload)).toThrow();
	});
});

describe('postSync', () => {
	const base = { appSyncUrl: 'http://localhost:5173', secret: 'test-secret-value', retries: 3, backoffMs: 1 };
	const noSleep = async () => {};

	it('POSTs JSON with the internal secret header and returns ok', async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const fetchImpl: typeof fetch = async (url, init) => {
			calls.push({ url: String(url), init: init ?? {} });
			return new Response('{"ok":true}', { status: 200 });
		};
		const res = await postSync(okPayload(), { ...base, fetchImpl, sleep: noSleep });
		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe('http://localhost:5173/api/internal/sync');
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers['x-internal-secret']).toBe('test-secret-value');
		expect(headers['content-type']).toBe('application/json');
		expect(JSON.parse(String(calls[0]!.init.body)).current.events).toHaveLength(2);
	});

	it('retries on 5xx then succeeds', async () => {
		let attempt = 0;
		const fetchImpl: typeof fetch = async () => {
			attempt += 1;
			if (attempt < 3) return new Response('oops', { status: 503 });
			return new Response(null, { status: 204 });
		};
		const res = await postSync(okPayload(), { ...base, fetchImpl, sleep: noSleep });
		expect(res.ok).toBe(true);
		expect(attempt).toBe(3);
	});

	it('does NOT retry on 4xx', async () => {
		let attempt = 0;
		const fetchImpl: typeof fetch = async () => {
			attempt += 1;
			return new Response('bad request', { status: 400 });
		};
		const res = await postSync(okPayload(), { ...base, fetchImpl, sleep: noSleep });
		expect(res.ok).toBe(false);
		expect(res.status).toBe(400);
		expect(attempt).toBe(1);
	});

	it('retries network errors and fails after exhausting retries', async () => {
		let attempt = 0;
		const fetchImpl: typeof fetch = async () => {
			attempt += 1;
			throw new TypeError('fetch failed');
		};
		const res = await postSync(okPayload(), { ...base, fetchImpl, sleep: noSleep });
		expect(res.ok).toBe(false);
		expect(attempt).toBe(3);
		expect(res.message).toContain('retries exhausted');
	});

	it('strips trailing slashes from appSyncUrl', async () => {
		const urls: string[] = [];
		const fetchImpl: typeof fetch = async (url) => {
			urls.push(String(url));
			return new Response('', { status: 200 });
		};
		await postSync(okPayload(), { ...base, appSyncUrl: 'https://example.com/', fetchImpl, sleep: noSleep });
		expect(urls[0]).toBe('https://example.com/api/internal/sync');
	});
});
