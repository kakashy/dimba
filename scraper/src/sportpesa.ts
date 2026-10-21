/**
 * Pure parsers for SportPesa data (DOM snapshots, HTML fragments, JSON APIs).
 * No I/O here — everything is a pure function so it can be unit-tested offline.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurrentEvent {
	eventNumber: number;
	kickoffTime: string | null;
	kickoffRaw: string | null;
	home: string;
	away: string;
	oddsHome: string | null;
	oddsDraw: string | null;
	oddsAway: string | null;
}

export interface DomGameCandidate {
	eventNumber?: number | null;
	kickoffText?: string | null;
	home?: string | null;
	away?: string | null;
	odds?: string[] | null;
}

export interface DomSnapshot {
	title: string;
	prizeText: string | null;
	text: string;
	combiHtml: string | null;
	games: DomGameCandidate[];
}

export interface HistoryEntry {
	jackpotId: string;
	humanId: number;
	status: string | null;
	finishedAt: string | null;
	prizeAmount: string | null;
}

export interface DetailsEvent {
	eventNumber: number;
	kickoffTime: string | null;
	home: string;
	away: string;
	resultPick: '1' | 'X' | '2' | null;
	score: string | null;
}

// ---------------------------------------------------------------------------
// Kickoff normalization (SportPesa shows EAT / Africa-Nairobi wall time)
// ---------------------------------------------------------------------------

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no DST

/** Convert a wall-clock EAT datetime to a UTC ISO string. */
function eatToIso(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number
): string | null {
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
	const utcMs = Date.UTC(year, month - 1, day, hour, minute) - NAIROBI_OFFSET_MS;
	if (!Number.isFinite(utcMs)) return null;
	return new Date(utcMs).toISOString();
}

/**
 * Normalize a kickoff string to a UTC ISO timestamp.
 * Handles: "16/10/26 - 20:00", "16/10/2026 20:00", "2026-10-16T20:00:00+03:00",
 * "2026-10-16 20:00", ISO with Z. Returns null when unparseable.
 */
export function normalizeKickoff(raw: string | null | undefined): string | null {
	if (raw === null || raw === undefined) return null;
	const s = String(raw).trim();
	if (s === '') return null;

	// Already ISO with an explicit zone (Z or ±HH:MM).
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}

	// dd/mm/yy(y)? optionally followed by separator and HH:mm
	const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—:]?\s*(\d{1,2}):(\d{2})?/);
	if (dmy) {
		const day = Number(dmy[1]);
		const month = Number(dmy[2]);
		let year = Number(dmy[3]);
		if (year < 100) year += 2000;
		const hour = dmy[4] !== undefined ? Number(dmy[4]) : 0;
		const minute = dmy[5] !== undefined ? Number(dmy[5]) : 0;
		return eatToIso(year, month, day, hour, minute);
	}

	// yyyy-mm-dd[ T]HH:mm(:ss)? without zone → assume EAT
	const isoLocal = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
	if (isoLocal) {
		return eatToIso(
			Number(isoLocal[1]),
			Number(isoLocal[2]),
			Number(isoLocal[3]),
			Number(isoLocal[4]),
			Number(isoLocal[5])
		);
	}

	// "HH:mm" alone, or bare date → not resolvable to an instant
	return null;
}

// ---------------------------------------------------------------------------
// Prize amount
// ---------------------------------------------------------------------------

/**
 * Extract a normalized digit-only prize amount, e.g.
 * "MEGA Jackpot Pro 17 | KSH 136,670,310" → "136670310".
 */
export function parsePrizeAmount(text: string | number | null | undefined): string | null {
	if (text === null || text === undefined) return null;
	const m = String(text).match(/KSH\.?\s*([0-9][0-9,\s]*)/i);
	const candidate = m?.[1] ?? null;
	if (candidate === null) return null;
	const digits = candidate.replace(/[^0-9]/g, '');
	return digits === '' ? null : digits;
}

// ---------------------------------------------------------------------------
// DOM/HTML fixture parsing
// ---------------------------------------------------------------------------

const KICKOFF_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—:]?\s*(\d{1,2}):(\d{2})\b/;
const ODDS_TOKEN_RE = /^\d{1,2}\.\d{1,3}$/;
const EVENT_NUMBER_RE = /^\d{1,3}$/;

function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'");
}

export function htmlToLines(html: string): string[] {
	const withBreaks = html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(div|p|li|tr|td|th|section|article|h[1-6]|span|button|combi-jackpots)>/gi, '\n');
	const text = decodeEntities(withBreaks.replace(/<[^>]*>/g, ' '));
	return text
		.split(/\r?\n/)
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

/** Try attribute-driven extraction first (data-* hooks), then fall back to text. */
export function parseFixtureListFromHtml(html: string): CurrentEvent[] {
	if (!html || html.trim() === '') return [];
	const attrGames = parseFromDataAttributes(html);
	const textGames = parseFixtureListFromLines(htmlToLines(html));
	// Prefer whichever produced more games; ties go to attribute extraction.
	return attrGames.length >= textGames.length && attrGames.length > 0 ? attrGames : textGames;
}

interface RawGame {
	eventNumber: number | null;
	kickoffRaw: string | null;
	home: string | null;
	away: string | null;
	odds: string[] | null;
}

function parseFromDataAttributes(html: string): CurrentEvent[] {
	// Elements that carry structured attributes (defensive; markup may change).
	const gameBlockRe =
		/<([a-z0-9-]+)\b[^>]*(?:data-game|data-event|class="[^"]*game[^"]*")[^>]*>([\s\S]*?)<\/\1>/gi;
	const games: RawGame[] = [];
	let block: RegExpExecArray | null;
	while ((block = gameBlockRe.exec(html)) !== null) {
		const inner = block[2] ?? '';
		const attr = (name: string): string | null => {
			const m = block![0].match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
			return m?.[1] ?? null;
		};
		const kickoff = attr('data-kickoff') ?? attr('data-time');
		const evRaw =
			attr('data-event-number') ?? attr('data-event') ?? attr('data-number') ?? attr('data-game');
		const evNum = evRaw !== null && /^\d+$/.test(evRaw) ? Number(evRaw) : null;
		const lines = htmlToLines(inner);
		const parsed = rawGameFromLines(
			lines,
			evNum ? Number(evNum) : null,
			kickoff
		);
		if (parsed) games.push(parsed);
	}
	return finalizeRawGames(games);
}

function parseFixtureListFromLines(lines: string[]): CurrentEvent[] {
	const games: RawGame[] = [];
	let pendingEventNumber: number | null = null;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';

		if (EVENT_NUMBER_RE.test(line)) {
			const n = Number(line);
			if (n >= 1 && n <= 99) pendingEventNumber = n;
			i += 1;
			continue;
		}

		if (!KICKOFF_RE.test(line)) {
			i += 1;
			continue;
		}

		const kickoffRaw = line;
		// Collect subsequent lines until odds are found or the next kickoff appears.
		const window: string[] = [];
		let odds: string[] | null = null;
		let j = i + 1;
		for (; j < lines.length && j <= i + 10; j += 1) {
			const l = lines[j] ?? '';
			if (KICKOFF_RE.test(l)) break;
			const maybeOdds = extractOddsTokens(l);
			if (maybeOdds.length >= 3) {
				odds = maybeOdds.slice(0, 3);
				j += 1;
				break;
			}
			if (EVENT_NUMBER_RE.test(l)) break; // next game's number without kickoff yet
			window.push(l);
		}

		const teams = pickTeamLines(window);
		if (teams) {
			games.push({
				eventNumber: pendingEventNumber,
				kickoffRaw,
				home: teams.home,
				away: teams.away,
				odds
			});
			pendingEventNumber = null;
		}
		i = Math.max(j, i + 1);
	}

	return finalizeRawGames(games);
}

function extractOddsTokens(line: string): string[] {
	const tokens = line.split(/[\s/|]+/).filter((t) => ODDS_TOKEN_RE.test(t));
	if (tokens.length >= 3) return tokens.map((t) => normalizeOdds(t));
	// Concatenated odds without separators, e.g. "2.103.403.30"
	const joined = line.match(/\d{1,2}\.\d{2}/g);
	if (joined && joined.length >= 3) return joined.slice(0, 3).map((t) => normalizeOdds(t));
	return tokens.map((t) => normalizeOdds(t));
}

function normalizeOdds(o: string): string {
	// "2.29" → "2.29"; strip trailing zeros beyond 2 decimals but keep ≥2.
	const [intPart, fracRaw = ''] = o.split('.');
	const frac = (fracRaw + '00').slice(0, 2);
	return `${intPart}.${frac}`;
}

function pickTeamLines(window: string[]): { home: string; away: string } | null {
	const clean = window.filter((l) => l !== '' && !/^\d{1,2}\.\d{1,2}$/.test(l));
	// "HOME v AWAY" / "HOME vs AWAY" / "HOME - AWAY" on one line
	for (const line of clean) {
		const m = line.match(/^(.{2,}?)\s+(?:v|vs\.?|VS\.?|–|-)\s+(.{2,})$/);
		if (m?.[1] && m[2] && !KICKOFF_RE.test(m[1]) && !KICKOFF_RE.test(m[2])) {
			return { home: m[1].trim(), away: m[2].trim() };
		}
	}
	if (clean.length >= 2) {
		return { home: clean[0] ?? '', away: clean[1] ?? '' };
	}
	return null;
}

function rawGameFromLines(
	lines: string[],
	eventNumber: number | null,
	kickoffOverride: string | null
): RawGame | null {
	let kickoffRaw = kickoffOverride;
	let odds: string[] | null = null;
	const rest: string[] = [];
	for (const line of lines) {
		if (kickoffRaw === null && KICKOFF_RE.test(line)) {
			kickoffRaw = line;
			continue;
		}
		const maybeOdds = extractOddsTokens(line);
		if (maybeOdds.length >= 3 && odds === null) {
			odds = maybeOdds.slice(0, 3);
			continue;
		}
		if (EVENT_NUMBER_RE.test(line)) continue;
		rest.push(line);
	}
	const teams = pickTeamLines(rest);
	if (!teams || kickoffRaw === null) return null;
	return { eventNumber, kickoffRaw, home: teams.home, away: teams.away, odds };
}

function finalizeRawGames(games: RawGame[]): CurrentEvent[] {
	const out: CurrentEvent[] = [];
	let seq = 0;
	for (const g of games) {
		if (!g.home || !g.away) continue;
		seq += 1;
		out.push({
			eventNumber: g.eventNumber ?? seq,
			kickoffTime: normalizeKickoff(g.kickoffRaw),
			kickoffRaw: g.kickoffRaw,
			home: g.home,
			away: g.away,
			oddsHome: g.odds?.[0] ?? null,
			oddsDraw: g.odds?.[1] ?? null,
			oddsAway: g.odds?.[2] ?? null
		});
	}
	return dedupeByEventNumber(out);
}

function dedupeByEventNumber(events: CurrentEvent[]): CurrentEvent[] {
	const seen = new Set<number>();
	const out: CurrentEvent[] = [];
	for (const e of events) {
		if (seen.has(e.eventNumber)) continue;
		seen.add(e.eventNumber);
		out.push(e);
	}
	return out;
}

/** Parse fixtures from an in-page DOM snapshot (produced by browser.ts). */
export function parseFixtureListFromSnapshot(snapshot: DomSnapshot): CurrentEvent[] {
	if (snapshot.games.length > 0) {
		const raws: RawGame[] = snapshot.games.map((g) => ({
			eventNumber: typeof g.eventNumber === 'number' ? g.eventNumber : null,
			kickoffRaw: g.kickoffText ?? null,
			home: g.home ?? null,
			away: g.away ?? null,
			odds: Array.isArray(g.odds) && g.odds.length >= 3 ? g.odds.slice(0, 3) : null
		}));
		const finalized = finalizeRawGames(raws);
		if (finalized.length > 0) return finalized;
	}
	if (snapshot.combiHtml && snapshot.combiHtml.trim() !== '') {
		const fromHtml = parseFixtureListFromHtml(snapshot.combiHtml);
		if (fromHtml.length > 0) return fromHtml;
	}
	return parseFixtureListFromLines(htmlToLines(snapshot.text ?? ''));
}

export function extractPrizeFromSnapshot(snapshot: DomSnapshot): string | null {
	const fromPrizeText = parsePrizeAmount(snapshot.prizeText);
	if (fromPrizeText !== null) return fromPrizeText;
	return parsePrizeAmount(snapshot.text);
}

// ---------------------------------------------------------------------------
// JSON API parsing (history list + jackpot details)
// ---------------------------------------------------------------------------

const looseObject = <T extends z.ZodRawShape>(shape: T) =>
	z.looseObject ? z.looseObject(shape) : z.object(shape);

function pickArrayField(raw: unknown, keys: string[]): unknown[] | null {
	if (Array.isArray(raw)) return raw;
	if (raw && typeof raw === 'object') {
		const obj = raw as Record<string, unknown>;
		for (const key of keys) {
			if (Array.isArray(obj[key])) return obj[key] as unknown[];
		}
	}
	return null;
}

const historyEntrySchema = looseObject({
	jackpotId: z
		.union([z.string(), z.number()])
		.transform((v) => String(v))
		.nullish()
		.default(null),
	jackpotHumanId: z.coerce.number().int().nonnegative().catch(0).default(0),
	jackpotStatus: z.string().nullish(),
	finished: z.string().nullish(),
	// tolerate alternate field names
	id: z.union([z.string(), z.number()]).optional(),
	humanId: z.coerce.number().int().nonnegative().optional(),
	status: z.string().nullish(),
	finishedAt: z.string().nullish(),
	prizeAmount: z.union([z.string(), z.number()]).nullish(),
	prize: z.union([z.string(), z.number()]).nullish(),
	jackpotPrize: z.union([z.string(), z.number()]).nullish()
});

/** Map API resultPick variants to the contract's '1' | 'X' | '2'. */
export function parseResultPick(raw: unknown): '1' | 'X' | '2' | null {
	if (raw === null || raw === undefined) return null;
	const s = String(raw).trim().toLowerCase();
	if (s === '1' || s === 'home') return '1';
	if (s === 'x' || s === 'draw' || s === 'd') return 'X';
	if (s === '2' || s === 'away' || s === 'a') return '2';
	return null;
}

/** Strip separators from a raw amount like "125,400,000" or 125000000. */
function digitsOnlyOrNull(raw: string | number | null | undefined): string | null {
	if (raw === null || raw === undefined) return null;
	const s = String(raw).trim();
	if (s === '') return null;
	// Plain numeric (incl. decimals) → floor to whole shillings.
	if (/^[0-9][0-9,]*(\.[0-9]+)?$/.test(s)) {
		const n = Number(s.replace(/,/g, ''));
		return Number.isFinite(n) ? String(Math.floor(n)) : null;
	}
	const digits = s.replace(/[^0-9]/g, '');
	return digits === '' ? null : digits;
}

export function parseHistoryListJson(raw: unknown): HistoryEntry[] {
	const arr = pickArrayField(raw, ['jackpots', 'data', 'history', 'items', 'results', 'content']);
	if (arr === null) return [];
	const out: HistoryEntry[] = [];
	for (const item of arr) {
		const parsed = historyEntrySchema.safeParse(item);
		if (!parsed.success) continue;
		const d = parsed.data;
		const jackpotId = d.jackpotId || (d.id !== undefined && d.id !== null ? String(d.id) : '');
		if (jackpotId === '') continue;
		const humanId =
			d.jackpotHumanId && d.jackpotHumanId > 0
				? d.jackpotHumanId
				: (d.humanId ?? 0);
		const status = d.jackpotStatus ?? d.status ?? null;
		const finishedAt = d.finished ?? d.finishedAt ?? null;
		const prizeAmount =
			parsePrizeAmount(d.prizeAmount ?? null) ??
			parsePrizeAmount(d.prize ?? null) ??
			parsePrizeAmount(d.jackpotPrize ?? null) ??
			digitsOnlyOrNull(d.prizeAmount ?? d.prize ?? d.jackpotPrize ?? null);
		out.push({ jackpotId, humanId, status, finishedAt, prizeAmount });
	}
	return out;
}

export function isFinished(entry: HistoryEntry, now: Date = new Date()): boolean {
	if (entry.status && /^finished$/i.test(entry.status)) return true;
	if (entry.finishedAt) {
		const t = new Date(entry.finishedAt).getTime();
		if (Number.isFinite(t) && t <= now.getTime()) return true;
	}
	return false;
}

/** Keep only finished rounds, most recent first, up to `limit`. */
export function selectRecentFinished(entries: HistoryEntry[], limit: number, now: Date = new Date()): HistoryEntry[] {
	return entries
		.filter((e) => isFinished(e, now))
		.sort((a, b) => {
			const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
			const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
			return tb - ta;
		})
		.slice(0, limit);
}

const detailsEventSchema = looseObject({
	eventNumber: z.coerce.number().int().catch(0),
	kickoffTime: z
		.union([z.string(), z.number()])
		.transform((v) => String(v))
		.nullish()
		.default(null),
	competitorHome: z.string().catch('').default(''),
	competitorAway: z.string().catch('').default(''),
	home: z.string().optional(),
	away: z.string().optional(),
	resultPick: z
		.union([z.string(), z.number()])
		.transform((v) => String(v).toUpperCase())
		.nullish()
		.default(null),
	score: z
		.union([z.string(), z.number()])
		.transform((v) => String(v))
		.nullish()
		.default(null)
});

export function parseJackpotDetailsJson(raw: unknown): DetailsEvent[] {
	const arr = pickArrayField(raw, ['events', 'data', 'jackpotEvents', 'results', 'items']);
	if (arr === null) return [];
	const out: DetailsEvent[] = [];
	for (const item of arr) {
		const parsed = detailsEventSchema.safeParse(item);
		if (!parsed.success) continue;
		const d = parsed.data;
		const home = d.competitorHome || d.home || '';
		const away = d.competitorAway || d.away || '';
		if (home === '' && away === '') continue;
		out.push({
			eventNumber: d.eventNumber,
			kickoffTime: normalizeKickoff(d.kickoffTime),
			home,
			away,
			resultPick: parseResultPick(d.resultPick),
			score: d.score ?? null
		});
	}
	return out;
}

/**
 * Build current-fixture events from an intercepted jackpot API payload
 * (events with competitorHome/competitorAway, no odds).
 */
export function parseCurrentEventsFromApiDetails(raw: unknown): CurrentEvent[] {
	return parseJackpotDetailsJson(raw).map((e) => ({
		eventNumber: e.eventNumber,
		kickoffTime: e.kickoffTime,
		kickoffRaw: null,
		home: e.home,
		away: e.away,
		oddsHome: null,
		oddsDraw: null,
		oddsAway: null
	}));
}

// ---------------------------------------------------------------------------
// Active jackpot (jackpot-offer-api.ke.sportpesa.com/api/jackpots/active)
// ---------------------------------------------------------------------------

export interface ActiveJackpot {
	jackpotId: string;
	humanId: number;
	numberOfEvents: number;
	events: CurrentEvent[];
}

const activeCompetitorSchema = z.looseObject({
	competitorName: z.string().catch('').default(''),
	isHome: z.boolean().catch(false).default(false)
});

const activeEventSchema = z.looseObject({
	utcKickOffTime: z.string().nullish().default(null),
	competitors: z.array(activeCompetitorSchema).catch([]).default([]),
	home: z.coerce.number().nullish().default(null),
	draw: z.coerce.number().nullish().default(null),
	away: z.coerce.number().nullish().default(null),
	order: z.coerce.number().int().positive().catch(0).default(0),
	// tolerate alternate shapes
	eventNumber: z.coerce.number().int().positive().optional(),
	kickoffTime: z.string().nullish().optional(),
	competitorHome: z.string().optional(),
	competitorAway: z.string().optional()
});

function oddsToString(n: number | null): string | null {
	if (n === null || !Number.isFinite(n)) return null;
	return normalizeOdds(n.toFixed(2));
}

function parseActiveEvent(item: unknown, seq: number): CurrentEvent | null {
	const parsed = activeEventSchema.safeParse(item);
	if (!parsed.success) return null;
	const d = parsed.data;
	const homeByName = d.competitors.find((c) => c.isHome);
	const awayByName = d.competitors.find((c) => !c.isHome);
	const home = d.competitorHome || homeByName?.competitorName || '';
	const away = d.competitorAway || awayByName?.competitorName || '';
	if (home === '' && away === '') return null;
	return {
		eventNumber: d.eventNumber && d.eventNumber > 0 ? d.eventNumber : d.order > 0 ? d.order : seq,
		kickoffTime: normalizeKickoff(d.utcKickOffTime ?? d.kickoffTime ?? null),
		kickoffRaw: null,
		home,
		away,
		oddsHome: oddsToString(d.home),
		oddsDraw: oddsToString(d.draw),
		oddsAway: oddsToString(d.away)
	};
}

/**
 * Parse the active jackpot payload served by jackpot-offer-api:
 * `{ id, humanId, settings.numberOfEvents, events: [{ utcKickOffTime,
 * competitors: [{competitorName, isHome}], home, draw, away, order }] }`.
 * Returns null when the payload doesn't look like an active jackpot.
 */
export function parseActiveJackpotJson(raw: unknown): ActiveJackpot | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const obj = raw as Record<string, unknown>;
	const arr = pickArrayField(obj, ['events', 'data', 'jackpotEvents']);
	if (arr === null) return null;

	const jackpotId =
		(typeof obj['id'] === 'string' && obj['id']) ||
		(typeof obj['jackpotId'] === 'string' && obj['jackpotId']) ||
		'';
	const humanId =
		typeof obj['humanId'] === 'number' ? obj['humanId'] :
		typeof obj['jackpotHumanId'] === 'number' ? obj['jackpotHumanId'] : 0;
	const settings = obj['settings'] && typeof obj['settings'] === 'object' ? (obj['settings'] as Record<string, unknown>) : null;
	const numberOfEvents =
		typeof settings?.['numberOfEvents'] === 'number' ? (settings['numberOfEvents'] as number) : arr.length;

	const events: CurrentEvent[] = [];
	let seq = 0;
	for (const item of arr) {
		seq += 1;
		const e = parseActiveEvent(item, seq);
		if (e) events.push(e);
	}
	if (events.length === 0) return null;
	return { jackpotId: String(jackpotId), humanId, numberOfEvents, events };
}

// ---------------------------------------------------------------------------
// Prizes
// ---------------------------------------------------------------------------

/**
 * Extract the top-prize amount from `/api/jackpots/multi`
 * (`jackpotPrizes.prizes` with `jackpotType: "17/17"`), preferring the highest
 * jackpot type, else the largest prize.
 */
export function parseMultiJackpotPrize(raw: unknown): string | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	const prizes =
		(obj['jackpotPrizes'] as Record<string, unknown> | undefined)?.['prizes'] ??
		obj['prizes'];
	if (!Array.isArray(prizes) || prizes.length === 0) return null;
	let best: { type: string; prize: number } | null = null;
	for (const p of prizes) {
		if (!p || typeof p !== 'object') continue;
		const rec = p as Record<string, unknown>;
		const prize = Number(rec['prize']);
		if (!Number.isFinite(prize)) continue;
		const type = String(rec['jackpotType'] ?? '');
		if (best === null || type > best.type || (type === best.type && prize > best.prize)) {
			best = { type, prize };
		}
	}
	return best === null ? null : digitsOnlyOrNull(Math.floor(best.prize));
}

/**
 * Extract prize amount from a jackpot details payload (`prizes` array with
 * `jackpotType`/`prize`), preferring the largest jackpot type.
 */
export function parseDetailsPrizeAmount(raw: unknown): string | null {
	if (!raw || typeof raw !== 'object') return null;
	const prizes = (raw as Record<string, unknown>)['prizes'];
	if (!Array.isArray(prizes) || prizes.length === 0) return null;
	let best: { type: string; prize: number } | null = null;
	for (const p of prizes) {
		if (!p || typeof p !== 'object') continue;
		const rec = p as Record<string, unknown>;
		const prize = Number(rec['prize']);
		if (!Number.isFinite(prize)) continue;
		const type = String(rec['jackpotType'] ?? '');
		if (best === null || type > best.type || (type === best.type && prize > best.prize)) {
			best = { type, prize };
		}
	}
	return best === null ? null : digitsOnlyOrNull(Math.floor(best.prize));
}
