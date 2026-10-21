/**
 * Playwright browser lifecycle: launch, stealth context, challenge passing,
 * network capture, DOM snapshot extraction, cookie-bearing JSON fetches.
 */
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { log } from './log.js';

export const MEGA_JACKPOT_URL = 'https://www.ke.sportpesa.com/en/mega-jackpot-pro';
export const HISTORY_API_BASE = 'https://jackpot-betslip.ke.sportpesa.com/api/jackpots/history';
/** Serves the currently-open Mega Jackpot Pro fixtures + odds (widget's own API). */
export const ACTIVE_JACKPOT_API = 'https://jackpot-offer-api.ke.sportpesa.com/api/jackpots/active';
/** Serves prize pools for the active multi jackpot. */
export const MULTI_JACKPOT_API = 'https://www.ke.sportpesa.com/api/jackpots/multi';

const CHALLENGE_TITLE_RE = /challenge\s*validation/i;

export const DEFAULT_LAUNCH_ARGS = [
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-dev-shm-usage',
	'--disable-gpu'
];

export const REALISTIC_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface NetworkCapture {
	url: string;
	status: number;
	contentType: string;
	body: string;
}

export async function launchBrowser(opts: { headless: boolean }): Promise<Browser> {
	return chromium.launch({
		headless: opts.headless,
		args: DEFAULT_LAUNCH_ARGS
	});
}

export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
	const context = await browser.newContext({
		timezoneId: 'Africa/Nairobi',
		locale: 'en-KE',
		viewport: { width: 1366, height: 900 },
		userAgent: REALISTIC_USER_AGENT,
		extraHTTPHeaders: { 'Accept-Language': 'en-KE,en;q=0.9' }
	});
	// tsx/esbuild injects an esbuild `__name` keep-names helper into evaluated
	// callbacks; define it in the page world so page.evaluate never throws.
	await context.addInitScript({
		content: 'globalThis.__name = globalThis.__name || ((target) => target);'
	});
	return context;
}

const INTERESTING_URL_RE =
	/(jackpot-betslip\.ke\.sportpesa\.com\/api\/jackpots|jackpot-offer-api\.ke\.sportpesa\.com\/api\/jackpots|jackpot-widget\.ke\.sportpesa\.com|www\.ke\.sportpesa\.com\/api\/jackpots)/i;

/** Collect JSON bodies from SportPesa jackpot API/widget endpoints. */
export function attachNetworkCapture(page: Page): NetworkCapture[] {
	const captured: NetworkCapture[] = [];
	page.on('response', (response) => {
		void (async () => {
			try {
				const url = response.url();
				if (!INTERESTING_URL_RE.test(url)) return;
				const contentType = response.headers()['content-type'] ?? '';
				if (!/json/i.test(contentType)) return;
				const body = await response.text();
				if (body.length === 0 || body.length > 5_000_000) return;
				captured.push({ url, status: response.status(), contentType, body });
				log.info('network', `captured ${response.status()} ${url.slice(0, 160)}`, {
					bytes: body.length
				});
			} catch {
				// response may be gone; ignore
			}
		})();
	});
	return captured;
}

export async function isChallengePage(page: Page): Promise<boolean> {
	try {
		const title = await page.title();
		return CHALLENGE_TITLE_RE.test(title ?? '');
	} catch {
		return false;
	}
}

async function combiReady(page: Page): Promise<boolean> {
	return page
		.evaluate(() => {
			const el = document.querySelector('combi-jackpots');
			if (!el) return false;
			const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
			const text = ((shadow ?? el).textContent ?? '').trim();
			return text.length > 50 || el.childElementCount > 0;
		})
		.catch(() => false);
}

/**
 * Navigate to the jackpot page and wait out the crypto challenge.
 * The challenge page reloads itself; we mostly wait. Throws on timeout.
 */
export async function navigateThroughChallenge(
	page: Page,
	url: string,
	timeoutMs: number
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	try {
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(30_000, timeoutMs) });
	} catch (err) {
		log.warn('challenge', `initial goto error: ${(err as Error).message}`);
	}

	while (Date.now() < deadline) {
		try {
			const challenge = await isChallengePage(page);
			if (!challenge) {
				const ready = await combiReady(page);
				// Even without <combi-jackpots>, accept a page that clearly shows fixtures.
				const pageText = await page
					.evaluate(() => (document.body?.innerText ?? '').slice(0, 20_000))
					.catch(() => '');
				const looksLikeFixtures = /MEGA\s*Jackpot\s*Pro/i.test(pageText);
				if (ready || looksLikeFixtures) {
					log.info('challenge', 'challenge passed; page content is live', { ready });
					return;
				}
			}
		} catch (err) {
			log.warn('challenge', `poll error: ${(err as Error).message}`);
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) break;
		await page.waitForTimeout(Math.min(1_000, remaining));
	}
	throw new Error(`Challenge not passed within ${timeoutMs}ms at ${url}`);
}

export interface DomSnapshotInPage {
	title: string;
	prizeText: string | null;
	text: string;
	combiHtml: string | null;
	games: Array<{
		eventNumber: number | null;
		kickoffText: string | null;
		home: string | null;
		away: string | null;
		odds: string[] | null;
	}>;
}

/**
 * Runs inside a document (main frame or iframe). Heuristic extraction:
 * combi-jackpots element, prize text, game cards.
 */
function extractDocumentSnapshot(): DomSnapshotInPage {
	const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

	const el = document.querySelector('combi-jackpots');
	const shadow = el ? (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot : null;
	const root: Element | ShadowRoot | null = shadow ?? el;

	const prizeEl = Array.from(document.querySelectorAll('*')).find(
		(n) => /MEGA\s*Jackpot\s*Pro/i.test(n.textContent ?? '') && (n.textContent ?? '').length < 200
	);
	const prizeText = prizeEl ? clean(prizeEl.textContent) : null;

	const text = document.body?.innerText ?? '';
	const combiHtml = el ? el.outerHTML : null;

	// Heuristic: find game-like cards inside the combi root (or the whole document).
	const scope: ParentNode = (root as ParentNode | null) ?? document;
	const candidateCards = Array.from(
		scope.querySelectorAll(
			'[class*="game"], [class*="event"], [class*="jackpot-item"], [data-game], [data-event]'
		)
	);

	const kickoffRe = new RegExp('\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\s*[-–—:]?\\s*\\d{1,2}:\\d{2,4}\\b');
	const oddsRe = /^d{1,2}.d{1,3}$/;
	const games: DomSnapshotInPage['games'] = [];

	for (const card of candidateCards) {
		const cardText = (card as HTMLElement).innerText ?? '';
		const raw: string[] = cardText
			.split(/\n+/)
			.map((l) => clean(l))
			.filter((l) => l !== '');
		if (raw.length < 2) continue;
		const kickoffLine = raw.find((l) => kickoffRe.test(l)) ?? null;
		const oddsTokens: string[] = [];
		for (const line of raw) {
			for (const tok of line.split(/[\s/|]+/)) {
				if (oddsRe.test(tok)) oddsTokens.push(tok);
			}
			if (oddsTokens.length >= 3) break;
		}
		const teams = raw.filter(
			(l) => l !== kickoffLine && !oddsRe.test(l) && !/^\d{1,3}$/.test(l) && !kickoffRe.test(l)
		);
		const numLine = raw.find((l) => /^\d{1,3}$/.test(l));
		if (teams.length >= 2 && kickoffLine) {
			games.push({
				eventNumber: numLine ? Number(numLine) : null,
				kickoffText: kickoffLine,
				home: teams[0] ?? null,
				away: teams[1] ?? null,
				odds: oddsTokens.length >= 3 ? oddsTokens.slice(0, 3) : null
			});
		}
	}

	return { title: document.title ?? '', prizeText, text, combiHtml, games };
}

/**
 * Extract a structured snapshot from the rendered page (main frame) plus the
 * jackpot widget iframe (where the fixtures actually render). Returns raw data
 * for the pure parsers in sportpesa.ts.
 */
export async function extractDomSnapshot(page: Page): Promise<DomSnapshotInPage> {
	const main = await page.evaluate(extractDocumentSnapshot);

	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		if (!/jackpot-widget|jackpot-offer/i.test(frame.url())) continue;
		try {
			const inFrame = await frame.evaluate(extractDocumentSnapshot);
			if (inFrame.games.length > main.games.length) {
				main.games = inFrame.games;
				log.info('browser', `extracted ${inFrame.games.length} game(s) from widget frame`);
			}
			if ((inFrame.text ?? '').length > 0) {
				main.text = `${main.text}\n${inFrame.text}`;
			}
			if (main.combiHtml === null) main.combiHtml = inFrame.combiHtml;
			if (main.prizeText === null) main.prizeText = inFrame.prizeText;
		} catch (err) {
			log.warn('browser', `frame extraction failed: ${(err as Error).message}`);
		}
	}
	return main;
}

export interface ApiJsonResult {
	ok: boolean;
	status: number;
	json: unknown | null;
	text: string;
}

/**
 * Fetch JSON using the browser context's cookie jar (challenge cookies included).
 * Playwright's APIRequestContext shares cookies and is not blocked by page CORS.
 */
export async function fetchJsonViaContext(context: BrowserContext, url: string): Promise<ApiJsonResult> {
	const response = await context.request.get(url, {
		headers: { accept: 'application/json' },
		timeout: 30_000
	});
	const text = await response.text();
	let json: unknown | null = null;
	try {
		json = JSON.parse(text) as unknown;
	} catch {
		// invalid JSON — leave json as null
	}
	return { ok: response.ok(), status: response.status(), json, text };
}

/** Fallback: fetch from inside the page (subject to CORS). */
export async function fetchJsonViaPage(page: Page, url: string): Promise<unknown | null> {
	try {
		return (await page.evaluate(async (u) => {
			const res = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' } });
			if (!res.ok) return null;
			return (await res.json()) as unknown;
		}, url)) as unknown | null;
	} catch {
		return null;
	}
}

export function historyListUrl(opts: { pageSize: number; epochMillis?: number }): string {
	const to = opts.epochMillis ?? Date.now() + 3 * 60 * 60 * 1000; // +3h EAT margin
	return `${HISTORY_API_BASE}?to=${to}&pageNum=0&pageSize=${opts.pageSize}`;
}

export function historyDetailsUrl(jackpotId: string): string {
	return `${HISTORY_API_BASE}/${encodeURIComponent(jackpotId)}/details`;
}
