import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

let dotenvLoaded = false;
function loadDotenvOnce(): void {
	if (dotenvLoaded) return;
	dotenvLoaded = true;
	loadDotenv({ path: path.resolve(here, '..', '.env'), quiet: true });
}

const boolish = z
	.union([z.boolean(), z.string()])
	.optional()
	.transform((v) => {
		if (typeof v === 'boolean') return v;
		if (v === undefined) return undefined;
		const s = v.trim().toLowerCase();
		if (['1', 'true', 'yes', 'on'].includes(s)) return true;
		if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
		return undefined;
	});

const envSchema = z.object({
	APP_SYNC_URL: z.url().default('http://localhost:5173'),
	INTERNAL_SYNC_SECRET: z
		.string()
		.min(8, 'INTERNAL_SYNC_SECRET must be at least 8 characters'),
	SCRAPER_HEADLESS: boolish,
	SCRAPER_HEADED: boolish,
	CHALLENGE_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(60_000),
	CHALLENGE_RETRIES: z.coerce.number().int().positive().max(10).default(3),
	HISTORY_ROUNDS: z.coerce.number().int().positive().max(20).default(5),
	HISTORY_PAGE_SIZE: z.coerce.number().int().positive().max(50).default(20),
	POST_RETRIES: z.coerce.number().int().positive().max(10).default(3),
	POST_BACKOFF_MS: z.coerce.number().int().nonnegative().max(120_000).default(1_500)
});

export interface Config {
	appSyncUrl: string;
	internalSyncSecret: string;
	headless: boolean;
	challengeTimeoutMs: number;
	challengeRetries: number;
	historyRounds: number;
	historyPageSize: number;
	postRetries: number;
	postBackoffMs: number;
	megaJackpotUrl: string;
}

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	loadDotenvOnce();
	const parsed = envSchema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
			.join('\n');
		throw new ConfigError(
			`Invalid scraper configuration:\n${issues}\n` +
				`Set INTERNAL_SYNC_SECRET (required) and optionally APP_SYNC_URL (default http://localhost:5173). ` +
				`You can put them in scraper/.env.`
		);
	}
	const e = parsed.data;
	// Headless unless SCRAPER_HEADED=1; SCRAPER_HEADLESS=0 also forces headed.
	const headless = e.SCRAPER_HEADED === true ? false : (e.SCRAPER_HEADLESS ?? true);
	return {
		appSyncUrl: stripTrailingSlash(e.APP_SYNC_URL),
		internalSyncSecret: e.INTERNAL_SYNC_SECRET,
		headless,
		challengeTimeoutMs: e.CHALLENGE_TIMEOUT_MS,
		challengeRetries: e.CHALLENGE_RETRIES,
		historyRounds: e.HISTORY_ROUNDS,
		historyPageSize: e.HISTORY_PAGE_SIZE,
		postRetries: e.POST_RETRIES,
		postBackoffMs: e.POST_BACKOFF_MS,
		megaJackpotUrl: 'https://www.ke.sportpesa.com/en/mega-jackpot-pro'
	};
}
