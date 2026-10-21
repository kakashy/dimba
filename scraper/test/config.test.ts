import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const baseEnv = (): NodeJS.ProcessEnv => ({ INTERNAL_SYNC_SECRET: 'unit-test-secret' });

describe('loadConfig', () => {
	it('fails fast with a clear message when secret is missing', () => {
		const env = baseEnv();
		delete env.INTERNAL_SYNC_SECRET;
		expect(() => loadConfig(env)).toThrow(ConfigError);
		try {
			loadConfig(env);
		} catch (err) {
			expect((err as Error).message).toContain('INTERNAL_SYNC_SECRET');
		}
	});

	it('rejects a too-short secret', () => {
		expect(() => loadConfig({ ...baseEnv(), INTERNAL_SYNC_SECRET: 'short' })).toThrow(ConfigError);
	});

	it('applies defaults', () => {
		const cfg = loadConfig(baseEnv());
		expect(cfg.appSyncUrl).toBe('http://localhost:5173');
		expect(cfg.headless).toBe(true);
		expect(cfg.challengeTimeoutMs).toBe(60_000);
		expect(cfg.challengeRetries).toBe(3);
		expect(cfg.historyRounds).toBe(5);
		expect(cfg.megaJackpotUrl).toBe('https://www.ke.sportpesa.com/en/mega-jackpot-pro');
	});

	it('reads env overrides and strips trailing slash from APP_SYNC_URL', () => {
		const cfg = loadConfig({
			...baseEnv(),
			APP_SYNC_URL: 'https://dimba.vercel.app/',
			CHALLENGE_TIMEOUT_MS: '90000',
			CHALLENGE_RETRIES: '5',
			POST_BACKOFF_MS: '250'
		});
		expect(cfg.appSyncUrl).toBe('https://dimba.vercel.app');
		expect(cfg.challengeTimeoutMs).toBe(90_000);
		expect(cfg.challengeRetries).toBe(5);
		expect(cfg.postBackoffMs).toBe(250);
	});

	it('SCRAPER_HEADED=1 forces headed mode', () => {
		expect(loadConfig({ ...baseEnv(), SCRAPER_HEADED: '1' }).headless).toBe(false);
		expect(loadConfig({ ...baseEnv(), SCRAPER_HEADLESS: '0' }).headless).toBe(false);
		expect(loadConfig({ ...baseEnv(), SCRAPER_HEADLESS: '1' }).headless).toBe(true);
	});

	it('rejects an invalid APP_SYNC_URL', () => {
		expect(() => loadConfig({ ...baseEnv(), APP_SYNC_URL: 'not-a-url' })).toThrow(ConfigError);
	});
});
