import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	extractPrizeFromSnapshot,
	isFinished,
	normalizeKickoff,
	parseActiveJackpotJson,
	parseDetailsPrizeAmount,
	parseFixtureListFromHtml,
	parseFixtureListFromSnapshot,
	parseHistoryListJson,
	parseJackpotDetailsJson,
	parsePrizeAmount,
	selectRecentFinished,
	type DomSnapshot
} from '../src/sportpesa.js';

const goldensDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'goldens');

function readGolden(name: string): string {
	return fs.readFileSync(path.join(goldensDir, name), 'utf8');
}

function readGoldenJson(name: string): unknown {
	return JSON.parse(readGolden(name)) as unknown;
}

const hasRealCombi =
	fs.existsSync(path.join(goldensDir, 'combi-jackpots.html')) ||
	fs.existsSync(path.join(goldensDir, 'sportpesa-megajackpot-pro.html'));
const hasRealHistory = fs.existsSync(path.join(goldensDir, 'history-list.json'));
const realDetailsFiles = fs
	.readdirSync(goldensDir)
	.filter((f) => /^jackpot-details-.*\.json$/.test(f) && !f.startsWith('synthetic'));

describe('normalizeKickoff', () => {
	it('parses SportPesa "dd/mm/yy - HH:mm" into UTC ISO (EAT +03)', () => {
		// 16/10/26 20:00 EAT = 17:00 UTC
		expect(normalizeKickoff('16/10/26 - 20:00')).toBe('2026-10-16T17:00:00.000Z');
	});

	it('parses 4-digit years and alternate separators', () => {
		expect(normalizeKickoff('16/10/2026 20:00')).toBe('2026-10-16T17:00:00.000Z');
		expect(normalizeKickoff('16/10/26 22:00')).toBe('2026-10-16T19:00:00.000Z');
		expect(normalizeKickoff('1/2/27 - 9:05')).toBe('2027-02-01T06:05:00.000Z');
	});

	it('passes through ISO with explicit zone', () => {
		expect(normalizeKickoff('2026-10-16T17:00:00Z')).toBe('2026-10-16T17:00:00.000Z');
		expect(normalizeKickoff('2026-10-16T20:00:00+03:00')).toBe('2026-10-16T17:00:00.000Z');
	});

	it('treats zone-less ISO as EAT', () => {
		expect(normalizeKickoff('2026-10-16T20:00:00')).toBe('2026-10-16T17:00:00.000Z');
		expect(normalizeKickoff('2026-10-16 20:00')).toBe('2026-10-16T17:00:00.000Z');
	});

	it('returns null for junk', () => {
		expect(normalizeKickoff(null)).toBeNull();
		expect(normalizeKickoff(undefined)).toBeNull();
		expect(normalizeKickoff('')).toBeNull();
		expect(normalizeKickoff('TBD')).toBeNull();
		expect(normalizeKickoff('Friday evening')).toBeNull();
	});
});

describe('parsePrizeAmount', () => {
	it('extracts digits from "KSH 136,670,310"', () => {
		expect(parsePrizeAmount('MEGA Jackpot Pro 17 | KSH 136,670,310')).toBe('136670310');
	});

	it('handles Ksh. variants and plain numbers', () => {
		expect(parsePrizeAmount('Ksh. 5,000,000')).toBe('5000000');
		expect(parsePrizeAmount('ksh 25000000')).toBe('25000000');
	});

	it('returns null when absent', () => {
		expect(parsePrizeAmount(null)).toBeNull();
		expect(parsePrizeAmount('no money here')).toBeNull();
		expect(parsePrizeAmount('')).toBeNull();
	});
});

describe('parseFixtureListFromHtml (synthetic golden)', () => {
	const html = readGolden('synthetic-combi.html');

	it('extracts all games with teams, kickoff and odds', () => {
		const events = parseFixtureListFromHtml(html);
		expect(events.length).toBe(7);

		const first = events[0]!;
		expect(first.eventNumber).toBe(1);
		expect(first.home).toBe('Gor Mahia');
		expect(first.away).toBe('AFC Leopards');
		expect(first.kickoffTime).toBe('2026-10-16T17:00:00.000Z');
		expect(first.oddsHome).toBe('2.29');
		expect(first.oddsDraw).toBe('3.50');
		expect(first.oddsAway).toBe('2.50');

		const last = events[6]!;
		expect(last.eventNumber).toBe(7);
		expect(last.home).toBe('Real Madrid');
		expect(last.kickoffTime).toBe('2026-10-18T12:00:00.000Z');
	});

	it('handles text-only fallback when data attributes are missing', () => {
		const stripped = html.replace(/\sdata-game="\d+"/g, '');
		const events = parseFixtureListFromHtml(stripped);
		expect(events.length).toBe(7);
		expect(events[1]!.home).toBe('Tusker FC');
		expect(events[1]!.oddsHome).toBe('1.95');
	});

	it('tolerates odds concatenated without separators', () => {
		const messy =
			'<div>1</div><div>16/10/26 - 20:00</div><div>Home FC</div><div>Away FC</div><div>2.103.403.30</div>';
		const events = parseFixtureListFromHtml(messy);
		expect(events.length).toBe(1);
		expect(events[0]!.oddsHome).toBe('2.10');
		expect(events[0]!.oddsAway).toBe('3.30');
	});

	it('supports "HOME v AWAY" on one line', () => {
		const oneLine = '<div>16/10/26 - 20:00</div><div>Home FC v Away FC</div><div>2.00 3.20 3.50</div>';
		const events = parseFixtureListFromHtml(oneLine);
		expect(events.length).toBe(1);
		expect(events[0]!.home).toBe('Home FC');
		expect(events[0]!.away).toBe('Away FC');
	});

	it('returns [] for empty input', () => {
		expect(parseFixtureListFromHtml('')).toEqual([]);
	});
});

describe('parseFixtureListFromSnapshot', () => {
	it('prefers in-page game candidates', () => {
		const snapshot: DomSnapshot = {
			title: 'Mega Jackpot Pro',
			prizeText: 'MEGA Jackpot Pro 17 | KSH 136,670,310',
			text: '',
			combiHtml: null,
			games: [
				{
					eventNumber: 1,
					kickoffText: '16/10/26 - 20:00',
					home: 'Gor Mahia',
					away: 'AFC Leopards',
					odds: ['2.29', '3.50', '2.50']
				},
				{ eventNumber: 2, kickoffText: '16/10/26 - 20:00', home: 'Tusker FC', away: 'KCB FC', odds: null }
			]
		};
		const events = parseFixtureListFromSnapshot(snapshot);
		expect(events.length).toBe(2);
		expect(events[0]!.oddsDraw).toBe('3.50');
		expect(events[1]!.oddsHome).toBeNull();
	});

	it('falls back to combiHtml, then text', () => {
		const html = readGolden('synthetic-combi.html');
		const fromHtml: DomSnapshot = {
			title: '',
			prizeText: null,
			text: 'nothing useful',
			combiHtml: html,
			games: []
		};
		expect(parseFixtureListFromSnapshot(fromHtml).length).toBe(7);

		const textOnly: DomSnapshot = {
			title: '',
			prizeText: null,
			text: '1\n16/10/26 - 20:00\nHome FC\nAway FC\n2.00 3.20 3.50',
			combiHtml: null,
			games: []
		};
		const events = parseFixtureListFromSnapshot(textOnly);
		expect(events.length).toBe(1);
		expect(events[0]!.home).toBe('Home FC');
	});

	it('extracts prize from snapshot text', () => {
		const snapshot: DomSnapshot = {
			title: '',
			prizeText: null,
			text: 'MEGA Jackpot Pro 17 | KSH 99,123,456',
			combiHtml: null,
			games: []
		};
		expect(extractPrizeFromSnapshot(snapshot)).toBe('99123456');
		expect(extractPrizeFromSnapshot({ ...snapshot, prizeText: 'KSH 1,000' })).toBe('1000');
	});
});

describe('parseHistoryListJson (synthetic golden)', () => {
	const raw = readGoldenJson('synthetic-history-list.json');

	it('parses entries tolerantly', () => {
		const entries = parseHistoryListJson(raw);
		expect(entries.length).toBe(5);
		expect(entries[0]!.jackpotId).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
		expect(entries[0]!.humanId).toBe(1287);
		expect(entries[0]!.status).toBe('Finished');
		expect(entries[1]!.prizeAmount).toBe('125400000');
	});

	it('accepts wrapped objects and junk entries', () => {
		const wrapped = { jackpots: [{ jackpotId: 'x', jackpotHumanId: 1, jackpotStatus: 'Finished' }, { nope: true }, null] };
		const entries = parseHistoryListJson(wrapped);
		expect(entries.length).toBe(1);
		expect(entries[0]!.jackpotId).toBe('x');
	});

	it('tolerates id/humanId aliases and numeric ids', () => {
		const entries = parseHistoryListJson([{ id: 42, humanId: 7, status: 'Finished', finishedAt: '2026-01-01T00:00:00Z' }]);
		expect(entries[0]!.jackpotId).toBe('42');
		expect(entries[0]!.humanId).toBe(7);
	});

	it('returns [] for non-array junk', () => {
		expect(parseHistoryListJson({ error: 'boom' })).toEqual([]);
		expect(parseHistoryListJson(null)).toEqual([]);
	});
});

describe('selectRecentFinished / isFinished', () => {
	const entries = parseHistoryListJson(readGoldenJson('synthetic-history-list.json'));
	const now = new Date('2026-10-20T00:00:00Z');

	it('keeps only finished rounds, newest first', () => {
		const recent = selectRecentFinished(entries, 2, now);
		expect(recent.length).toBe(2);
		expect(recent[0]!.humanId).toBe(1287);
		expect(recent[1]!.humanId).toBe(1286);
	});

	it('classifies by status and by past finished date', () => {
		expect(isFinished({ jackpotId: 'a', humanId: 1, status: 'Finished', finishedAt: null, prizeAmount: null }, now)).toBe(true);
		expect(isFinished({ jackpotId: 'a', humanId: 1, status: null, finishedAt: '2026-01-01T00:00:00Z', prizeAmount: null }, now)).toBe(true);
		expect(isFinished({ jackpotId: 'a', humanId: 1, status: 'Active', finishedAt: null, prizeAmount: null }, now)).toBe(false);
	});
});

describe('parseJackpotDetailsJson (synthetic golden)', () => {
	const raw = readGoldenJson('synthetic-jackpot-details.json');

	it('parses finished events with resultPick and score', () => {
		const events = parseJackpotDetailsJson(raw);
		expect(events.length).toBe(5);
		expect(events[0]).toMatchObject({
			eventNumber: 1,
			home: 'Gor Mahia',
			away: 'AFC Leopards',
			resultPick: '1',
			score: '2:1'
		});
		expect(events[0]!.kickoffTime).toBe('2026-10-10T14:00:00.000Z');
		expect(events[4]!.resultPick).toBeNull();
		expect(events[4]!.score).toBeNull();
	});

	it('tolerates missing resultPick/score and alternate field names', () => {
		const events = parseJackpotDetailsJson({
			events: [{ eventNumber: 1, competitorHome: 'A', competitorAway: 'B' }]
		});
		expect(events.length).toBe(1);
		expect(events[0]!.resultPick).toBeNull();

		const alt = parseJackpotDetailsJson({ data: [{ eventNumber: 2, home: 'C', away: 'D', resultPick: 'x', score: '1:0' }] });
		expect(alt[0]!.resultPick).toBe('X');
	});

	it('normalizes lowercase picks', () => {
		const events = parseJackpotDetailsJson([{ eventNumber: 1, competitorHome: 'A', competitorAway: 'B', resultPick: '2' }]);
		expect(events[0]!.resultPick).toBe('2');
	});

	it('returns [] for junk', () => {
		expect(parseJackpotDetailsJson({})).toEqual([]);
		expect(parseJackpotDetailsJson('nope')).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Real-capture goldens (run only when a capture produced them)
// ---------------------------------------------------------------------------

describe('real capture goldens', () => {
	it.runIf(hasRealCombi)('parses captured page HTML without crashing and finds the prize', () => {
		const html = fs.existsSync(path.join(goldensDir, 'combi-jackpots.html'))
			? readGolden('combi-jackpots.html')
			: readGolden('sportpesa-megajackpot-pro.html');
		// The live page renders fixtures inside an iframe from jackpot-widget, so
		// the DOM parser may legitimately return 0 events here — it must not throw.
		const events = parseFixtureListFromHtml(html);
		expect(Array.isArray(events)).toBe(true);
		expect(events.length === 0 || events.length >= 13).toBe(true);
		if (events.length > 0) {
			expect(events[0]!.home.length).toBeGreaterThan(1);
			expect(events[0]!.away.length).toBeGreaterThan(1);
		}
	});

	it.runIf(fs.existsSync(path.join(goldensDir, 'sportpesa-megajackpot-pro.html')))(
		'extracts prize amount from the captured page',
		() => {
			const prize = parsePrizeAmount(readGolden('sportpesa-megajackpot-pro.html'));
			expect(prize).not.toBeNull();
			expect(prize!.length).toBeGreaterThanOrEqual(9);
		}
	);

	it.runIf(fs.existsSync(path.join(goldensDir, 'active-jackpot.json')))(
		'parses the captured active jackpot (17 fixtures with odds)',
		() => {
			const active = parseActiveJackpotJson(readGoldenJson('active-jackpot.json'));
			expect(active).not.toBeNull();
			expect(active!.events.length).toBeGreaterThanOrEqual(13);
			expect(active!.humanId).toBeGreaterThan(0);
			const first = active!.events[0]!;
			expect(first.home.length).toBeGreaterThan(1);
			expect(first.away.length).toBeGreaterThan(1);
			expect(first.kickoffTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
			expect(Number(first.oddsHome)).toBeGreaterThan(1);
			// event numbers are sequential from 1
			expect(active!.events.map((e) => e.eventNumber)).toEqual(
				active!.events.map((_, i) => i + 1)
			);
		}
	);

	it.runIf(hasRealHistory)('parses captured history list', () => {
		const entries = parseHistoryListJson(readGoldenJson('history-list.json'));
		expect(entries.length).toBeGreaterThan(0);
		expect(entries[0]!.jackpotId.length).toBeGreaterThan(5);
	});

	it.each(realDetailsFiles)('parses captured details file %s', (file) => {
		const events = parseJackpotDetailsJson(readGoldenJson(file));
		expect(events.length).toBeGreaterThan(0);
		// Real API sends Home/Draw/Away — must map into the '1'|'X'|'2' contract.
		for (const e of events) {
			if (e.resultPick !== null) expect(['1', 'X', '2']).toContain(e.resultPick);
			expect(e.score === null || /^\d+:\d+$/.test(e.score)).toBe(true);
		}
		expect(events.some((e) => e.resultPick !== null)).toBe(true);
		expect(parseDetailsPrizeAmount(readGoldenJson(file))).toMatch(/^\d{9,}$/);
	});
});
