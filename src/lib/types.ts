import type { JackpotStatus, PickValue, SetLabel } from '#lib/server/db/schema';

export type { JackpotStatus, PickValue, SetLabel };

/** Dates are `Date` on the server (drizzle) and ISO strings after JSON transport. */
export type DateLike = string | Date;

export interface Jackpot {
	id: string;
	humanId: number;
	name: string;
	status: JackpotStatus;
	prizeAmount: string | null;
	finishedAt: DateLike | null;
	scrapedAt: DateLike;
	createdAt: DateLike;
}

export interface FixtureEvent {
	id: string;
	jackpotId: string;
	eventNumber: number;
	kickoffTime: DateLike | null;
	home: string;
	away: string;
	oddsHome: string | null;
	oddsDraw: string | null;
	oddsAway: string | null;
	resultPick: PickValue | null;
	score: string | null;
}

export interface Prediction {
	id: string;
	jackpotId: string;
	setLabel: SetLabel;
	picks: (PickValue | null)[];
	score: number | null;
	clientUpdatedAt: DateLike;
	serverUpdatedAt: DateLike;
}

export interface CurrentJackpotResponse {
	jackpot: Jackpot | null;
	events: FixtureEvent[];
	predictions: Partial<Record<SetLabel, Prediction>>;
}

export interface HistoryJackpotEntry {
	jackpot: Jackpot;
	events: FixtureEvent[];
	predictions: Partial<Record<SetLabel, Prediction>>;
}

export interface HistoryResponse {
	jackpots: HistoryJackpotEntry[];
}

export const SET_LABELS: readonly SetLabel[] = ['A', 'B', 'C'];
export const PICK_VALUES: readonly PickValue[] = ['1', 'X', '2'];

export const SET_LABEL_TEXT: Record<SetLabel, string> = {
	A: 'Set A',
	B: 'Set B',
	C: 'Set C'
};

export function scorePicks(
	picks: (PickValue | null)[],
	results: (PickValue | null)[] | undefined
): number {
	if (!results) return 0;
	let correct = 0;
	for (let i = 0; i < picks.length; i++) {
		if (picks[i] && picks[i] === results[i]) correct++;
	}
	return correct;
}

export function emptyPicks(count: number): (PickValue | null)[] {
	return Array.from({ length: count }, () => null);
}
