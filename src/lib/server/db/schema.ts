import {
	bigint,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	integer
} from 'drizzle-orm/pg-core';

export type PickValue = '1' | 'X' | '2';
export type SetLabel = 'A' | 'B' | 'C';
export type JackpotStatus = 'active' | 'finished';

export const jackpots = pgTable(
	'jackpots',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		humanId: integer('human_id').notNull(),
		name: text('name').notNull().default('MEGA Jackpot Pro'),
		status: text('status').$type<JackpotStatus>().notNull().default('active'),
		prizeAmount: numeric('prize_amount', { precision: 14, scale: 2 }),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('jackpots_human_id_idx').on(t.humanId)]
);

export const events = pgTable(
	'events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		jackpotId: uuid('jackpot_id')
			.notNull()
			.references(() => jackpots.id, { onDelete: 'cascade' }),
		eventNumber: integer('event_number').notNull(),
		kickoffTime: timestamp('kickoff_time', { withTimezone: true }),
		home: text('home').notNull(),
		away: text('away').notNull(),
		oddsHome: numeric('odds_home', { precision: 6, scale: 2 }),
		oddsDraw: numeric('odds_draw', { precision: 6, scale: 2 }),
		oddsAway: numeric('odds_away', { precision: 6, scale: 2 }),
		resultPick: text('result_pick').$type<PickValue>(),
		score: text('score')
	},
	(t) => [uniqueIndex('events_jackpot_event_idx').on(t.jackpotId, t.eventNumber)]
);

export const predictions = pgTable(
	'predictions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		jackpotId: uuid('jackpot_id')
			.notNull()
			.references(() => jackpots.id, { onDelete: 'cascade' }),
		setLabel: text('set_label').$type<SetLabel>().notNull(),
		picks: jsonb('picks').$type<PickValue[] | (PickValue | null)[]>().notNull(),
		score: integer('score'),
		clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull().defaultNow(),
		serverUpdatedAt: timestamp('server_updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('predictions_jackpot_set_idx').on(t.jackpotId, t.setLabel)]
);

export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		expirationTime: timestamp('expiration_time', { withTimezone: true }),
		userAgent: text('user_agent'),
		failures: integer('failures').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	}
);

export const scrapeRuns = pgTable('scrape_runs', {
	id: uuid('id').defaultRandom().primaryKey(),
	ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
	status: text('status').$type<'ok' | 'error'>().notNull(),
	message: text('message'),
	jackpotsUpserted: integer('jackpots_upserted').notNull().default(0)
});
