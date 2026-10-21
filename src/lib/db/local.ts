import Dexie, { type Table } from 'dexie';

export const isBrowser = typeof window !== 'undefined';

export type DbJackpot = {
	id: string;
	humanId: number;
	name: string;
	status: 'active' | 'finished';
	prizeAmount: string | null;
	finishedAt: Date | null;
	scrapedAt: Date;
	createdAt: Date;
};

export type DbEvent = {
	id: string;
	jackpotId: string;
	eventNumber: number;
	kickoffTime: Date | null;
	home: string;
	away: string;
	oddsHome: string | null;
	oddsDraw: string | null;
	oddsAway: string | null;
	resultPick: '1' | 'X' | '2' | null;
	score: string | null;
};

export type DbPrediction = {
	id: string;
	jackpotId: string;
	setLabel: 'A' | 'B' | 'C';
	picks: ('1' | 'X' | '2' | null)[];
	score: number | null;
	clientUpdatedAt: Date;
	serverUpdatedAt: Date;
};

export type DbOutbox = {
	id?: number;
	jackpotId: string;
	setLabel: 'A' | 'B' | 'C';
	picks: ('1' | 'X' | '2' | null)[];
	clientUpdatedAt: Date;
	attempts: number;
	lastError: string | null;
};

export class DimbaDb extends Dexie {
	jackpots!: Table<DbJackpot, string>;
	events!: Table<DbEvent, string>;
	predictions!: Table<DbPrediction, string>;
	outbox!: Table<DbOutbox, number>;
	meta!: Table<{ key: string; value: string }, string>;

	constructor() {
		super('DimbaDb');
		this.version(1).stores({
			jackpots: 'id, humanId, status, scrapedAt',
			events: 'id, jackpotId, [jackpotId+eventNumber]',
			predictions: 'id, jackpotId, [jackpotId+setLabel]',
			outbox: '++id, jackpotId',
			meta: 'key'
		});
	}
}

export const db = isBrowser ? new DimbaDb() : null;

/** One-line helpers so components never import Dexie directly when not needed. */
export const localDb = {
	get db(): DimbaDb | null {
		return db;
	}
};
