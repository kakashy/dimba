/**
 * Golden capture mode: run the scrape pipeline and save raw HTML / intercepted
 * JSON / extracted fixtures into test/goldens/ WITHOUT POSTing anywhere.
 *
 * Usage: APP_SYNC_URL=http://localhost:9 SCRAPER_HEADED=1 pnpm capture
 * (INTERNAL_SYNC_SECRET is still required by config; use any dummy value.)
 */
import { ConfigError, loadConfig } from './config.js';
import { log } from './log.js';
import { DEFAULT_GOLDEN_DIR, runScrape, writeGoldens } from './pipeline.js';

async function main(): Promise<number> {
	let config;
	try {
		config = loadConfig();
	} catch (err) {
		if (err instanceof ConfigError) {
			log.error('config', err.message);
			return 3;
		}
		throw err;
	}

	log.info('capture', 'starting capture run (no POST)', {
		target: config.megaJackpotUrl,
		goldens: DEFAULT_GOLDEN_DIR
	});

	const scrape = await runScrape(config);
	const written = await writeGoldens(scrape, DEFAULT_GOLDEN_DIR);

	log.info('capture', `wrote ${written.length} golden file(s)`, {
		reachedPage: scrape.browserReachedPage,
		currentEvents: scrape.current?.events.length ?? 0,
		finishedRounds: scrape.finished.length
	});
	if (scrape.errors.length > 0) {
		log.warn('capture', `errors during scrape: ${scrape.errors.join('; ')}`);
	}

	return scrape.browserReachedPage ? 0 : 1;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((err: unknown) => {
		log.error('fatal', (err as Error).stack ?? String(err));
		process.exitCode = 2;
	});
