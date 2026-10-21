/**
 * Shared scrape pipeline used by both the sync run (index.ts) and the
 * golden-file capture (capture.ts). No POSTs here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext } from 'playwright';
import {
	ACTIVE_JACKPOT_API,
	attachNetworkCapture,
	createStealthContext,
	extractDomSnapshot,
	fetchJsonViaContext,
	fetchJsonViaPage,
	historyDetailsUrl,
	historyListUrl,
	launchBrowser,
	MEGA_JACKPOT_URL,
	MULTI_JACKPOT_API,
	navigateThroughChallenge,
	type NetworkCapture
} from './browser.js';
import type { Config } from './config.js';
import { log } from './log.js';
import {
	extractPrizeFromSnapshot,
	parseActiveJackpotJson,
	parseDetailsPrizeAmount,
	parseFixtureListFromSnapshot,
	parseHistoryListJson,
	parseJackpotDetailsJson,
	parseMultiJackpotPrize,
	parsePrizeAmount,
	selectRecentFinished,
	type ActiveJackpot,
	type CurrentEvent,
	type DetailsEvent,
	type DomSnapshot,
	type HistoryEntry
} from './sportpesa.js';

export interface ScrapeResult {
	browserReachedPage: boolean;
	method: 'dom' | 'api';
	pageUrl: string;
	snapshot: DomSnapshot | null;
	current: {
		humanId: number;
		name: string;
		prizeAmount: string | null;
		events: CurrentEvent[];
	} | null;
	finished: Array<{ entry: HistoryEntry; prizeAmount: string | null; events: DetailsEvent[] }>;
	captured: NetworkCapture[];
	pageHtml: string | null;
	errors: string[];
}

export async function runScrape(config: Config): Promise<ScrapeResult> {
	const result: ScrapeResult = {
		browserReachedPage: false,
		method: 'dom',
		pageUrl: config.megaJackpotUrl,
		snapshot: null,
		current: null,
		finished: [],
		captured: [],
		pageHtml: null,
		errors: []
	};

	let browser: Browser | null = null;
	try {
		browser = await launchBrowser({ headless: config.headless });
		log.info('browser', `chromium launched (headless=${config.headless})`);

		let context: BrowserContext | null = null;
		for (let attempt = 1; attempt <= config.challengeRetries; attempt += 1) {
			context = await createStealthContext(browser);
			const page = await context.newPage();
			const captured = attachNetworkCapture(page);
			try {
				log.info('challenge', `attempt ${attempt}/${config.challengeRetries}: navigating`);
				await navigateThroughChallenge(page, MEGA_JACKPOT_URL, config.challengeTimeoutMs);
				result.browserReachedPage = true;
				result.captured = captured;
				break;
			} catch (err) {
				log.warn('challenge', `attempt ${attempt} failed: ${(err as Error).message}`);
				result.errors.push(`challenge attempt ${attempt}: ${(err as Error).message}`);
				result.captured = captured;
				await context.close().catch(() => {});
				context = null;
			}
		}

		if (!context || !result.browserReachedPage) {
			result.errors.push(
				`could not pass challenge after ${config.challengeRetries} attempt(s)`
			);
			return result;
		}

		const page = context.pages()[0] ?? (await context.newPage());

		// --- Current fixtures -------------------------------------------------
		result.pageHtml = await page.content().catch(() => null);
		try {
			const inPage = await extractDomSnapshot(page);
			const snapshot: DomSnapshot = {
				title: inPage.title,
				prizeText: inPage.prizeText,
				text: inPage.text,
				combiHtml: inPage.combiHtml,
				games: inPage.games
			};
			result.snapshot = snapshot;

			let events = parseFixtureListFromSnapshot(snapshot);
			let method: 'dom' | 'api' = 'dom';
			let humanId = 0;
			log.info('fixtures', `DOM extraction produced ${events.length} event(s)`, {
				gamesInSnapshot: inPage.games.length
			});

			// Fallback 1: active jackpot JSON sniffed from page traffic
			// (the widget iframe itself fetches jackpot-offer-api .../active).
			if (events.length < 3) {
				const active = findActiveJackpotInCaptured(result.captured);
				if (active !== null && active.events.length > events.length) {
					events = active.events;
					humanId = active.humanId;
					method = 'api';
					log.info('fixtures', `using intercepted active jackpot API (${events.length} events, humanId=${active.humanId})`);
				}
			}

			// Fallback 2: fetch the active jackpot API directly with browser cookies.
			if (events.length < 3) {
				log.info('fixtures', `GET ${ACTIVE_JACKPOT_API}`);
				const res = await fetchJsonViaContext(context, ACTIVE_JACKPOT_API);
				if (res.json !== null) {
					// Record for golden capture.
					result.captured.push({
						url: ACTIVE_JACKPOT_API,
						status: res.status,
						contentType: 'application/json',
						body: typeof res.text === 'string' && res.text !== '' ? res.text : JSON.stringify(res.json)
					});
					const active = parseActiveJackpotJson(res.json);
					if (active && active.events.length > events.length) {
						events = active.events;
						humanId = active.humanId;
						method = 'api';
						log.info('fixtures', `using direct active jackpot API (${events.length} events, humanId=${active.humanId})`);
					}
				}
			}

			if (humanId === 0) humanId = findHumanIdInCaptured(result.captured) ?? 0;
			let prizeAmount = extractPrizeFromSnapshot(snapshot) ?? findPrizeInCaptured(result.captured);

			// Prize fallback: /api/jackpots/multi jackpotPrizes (17/17 pool).
			if (prizeAmount === null) {
				const multi = findJsonInCaptured(result.captured, /api\/jackpots\/multi/i);
				if (multi !== null) prizeAmount = parseMultiJackpotPrize(multi);
			}
			if (prizeAmount === null) {
				log.info('fixtures', `GET ${MULTI_JACKPOT_API}`);
				const res = await fetchJsonViaContext(context, MULTI_JACKPOT_API);
				if (res.json !== null) {
					result.captured.push({
						url: MULTI_JACKPOT_API,
						status: res.status,
						contentType: 'application/json',
						body: typeof res.text === 'string' && res.text !== '' ? res.text : JSON.stringify(res.json)
					});
					prizeAmount = parseMultiJackpotPrize(res.json);
				}
			}

			if (events.length > 0) {
				result.current = { humanId, name: 'MEGA Jackpot Pro', prizeAmount, events };
				result.method = method;
			} else {
				result.errors.push('fixture extraction produced no events');
			}
		} catch (err) {
			result.errors.push(`fixture extraction failed: ${(err as Error).message}`);
			log.error('fixtures', (err as Error).message);
		}

		// --- Finished rounds -------------------------------------------------
		try {
			result.finished = await fetchFinishedRounds(context, config, result.captured);
			log.info('history', `fetched ${result.finished.length} finished round(s)`);
		} catch (err) {
			result.errors.push(`history fetch failed: ${(err as Error).message}`);
			log.error('history', (err as Error).message);
		}

		await context.close().catch(() => {});
	} finally {
		if (browser) await browser.close().catch(() => {});
	}

	return result;
}

function parsedJsonBodies(captured: NetworkCapture[]): Array<{ url: string; json: unknown }> {
	const out: Array<{ url: string; json: unknown }> = [];
	for (const c of captured) {
		try {
			out.push({ url: c.url, json: JSON.parse(c.body) as unknown });
		} catch {
			// ignore non-JSON
		}
	}
	return out;
}

function findJsonInCaptured(captured: NetworkCapture[], pattern: RegExp): unknown | null {
	for (const { url, json } of parsedJsonBodies(captured)) {
		if (pattern.test(url)) return json;
	}
	return null;
}

function findActiveJackpotInCaptured(captured: NetworkCapture[]): ActiveJackpot | null {
	for (const { url, json } of parsedJsonBodies(captured)) {
		if (!/jackpots\/active/i.test(url)) continue;
		const active = parseActiveJackpotJson(json);
		if (active && active.events.length >= 3) return active;
	}
	return null;
}

function findHumanIdInCaptured(captured: NetworkCapture[]): number | null {
	for (const { json } of parsedJsonBodies(captured)) {
		try {
			const entries = parseHistoryListJson(json);
			const active = entries.find((e) => e.humanId > 0 && !/finished/i.test(e.status ?? ''));
			if (active) return active.humanId;
			const any = entries.find((e) => e.humanId > 0);
			if (any) return any.humanId;
		} catch {
			// try next
		}
	}
	return null;
}

function findPrizeInCaptured(captured: NetworkCapture[]): string | null {
	for (const c of captured) {
		const prize = parsePrizeAmount(c.body);
		if (prize !== null) return prize;
	}
	return null;
}

async function fetchFinishedRounds(
	context: BrowserContext,
	config: Config,
	captured: NetworkCapture[]
): Promise<Array<{ entry: HistoryEntry; prizeAmount: string | null; events: DetailsEvent[] }>> {
	let listUrl = historyListUrl({ pageSize: config.historyPageSize });
	let listJson: unknown | null = null;

	// Prefer history-list JSON sniffed from the page's own traffic.
	for (const { url, json } of parsedJsonBodies(captured)) {
		if (/history/i.test(url) && parseHistoryListJson(json).length > 0) {
			listJson = json;
			listUrl = url;
			log.info('history', 'using history list from captured network traffic');
			break;
		}
	}

	if (listJson === null) {
		log.info('history', `GET ${listUrl}`);
		const res = await fetchJsonViaContext(context, listUrl);
		if (!res.ok && res.json === null) {
			// last resort: page-context fetch (CORS may block)
			const viaPage = await fetchJsonViaPage(context.pages()[0] ?? (await context.newPage()), listUrl);
			if (viaPage === null) {
				throw new Error(`history list request failed: HTTP ${res.status}`);
			}
			listJson = viaPage;
		} else {
			listJson = res.json;
		}
		// Record into captured so capture mode persists it as a golden.
		if (listJson !== null) {
			captured.push({
				url: listUrl,
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(listJson)
			});
		}
	}

	const entries = parseHistoryListJson(listJson);
	if (entries.length === 0) {
		log.warn('history', 'history list parsed to zero entries');
		return [];
	}

	const recent = selectRecentFinished(entries, config.historyRounds);
	const rounds: Array<{ entry: HistoryEntry; prizeAmount: string | null; events: DetailsEvent[] }> = [];

	for (const entry of recent) {
		// Reuse intercepted details response when available.
		let events: DetailsEvent[] = [];
		for (const { url, json } of parsedJsonBodies(captured)) {
			if (url.includes(entry.jackpotId) && /details/i.test(url)) {
				events = parseJackpotDetailsJson(json);
				break;
			}
		}
		let prizeAmount = entry.prizeAmount ?? null;
		if (events.length === 0) {
			const url = historyDetailsUrl(entry.jackpotId);
			log.info('history', `GET ${url}`);
			const res = await fetchJsonViaContext(context, url);
			if (!res.ok && res.json === null) {
				log.warn('history', `details for ${entry.jackpotId} failed: HTTP ${res.status}`);
				continue;
			}
			events = parseJackpotDetailsJson(res.json);
			prizeAmount = prizeAmount ?? parseDetailsPrizeAmount(res.json);
			if (res.json !== null) {
				captured.push({
					url,
					status: res.status,
					contentType: 'application/json',
					body: typeof res.text === 'string' && res.text !== '' ? res.text : JSON.stringify(res.json)
				});
			}
		}
		rounds.push({ entry, prizeAmount, events });
		log.info('history', `round #${entry.humanId || entry.jackpotId}: ${events.length} event(s)`);
	}

	return rounds;
}

// ---------------------------------------------------------------------------
// Golden capture helpers (used by capture.ts)
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_GOLDEN_DIR = path.resolve(here, '..', 'test', 'goldens');

export async function writeGoldens(result: ScrapeResult, dir: string): Promise<string[]> {
	await fs.mkdir(dir, { recursive: true });
	const written: string[] = [];
	const write = async (name: string, content: string) => {
		const file = path.join(dir, name);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, content, 'utf8');
		written.push(file);
	};

	if (result.pageHtml) await write('sportpesa-megajackpot-pro.html', result.pageHtml);
	if (result.snapshot?.combiHtml) await write('combi-jackpots.html', result.snapshot.combiHtml);
	if (result.snapshot) {
		await write('dom-snapshot.json', JSON.stringify(result.snapshot, null, 2));
	}
	if (result.current) {
		await write('extracted-current.json', JSON.stringify(result.current, null, 2));
	}

	for (const c of result.captured) {
		const safe = c.url.replace(/[^a-zA-Z0-9]+/g, '_').slice(-80);
		await write(`intercepted/${safe}.json`, c.body);
		if (/history(?!.*details)/i.test(c.url) && !c.url.includes('/details')) {
			await write('history-list.json', c.body);
		}
		if (/details/i.test(c.url)) {
			await write(`jackpot-details-${safe}.json`, c.body);
		}
	}

	await write('scrape-summary.json', JSON.stringify({ errors: result.errors, method: result.method }, null, 2));
	return written;
}
