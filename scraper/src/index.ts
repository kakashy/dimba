/**
 * Dimba scraper entrypoint: scrape SportPesa Mega Jackpot Pro fixtures +
 * recent finished results, then POST the normalized payload to the Dimba app.
 *
 * Exit codes (Cloud Run job contract):
 *   0 - scrape ok AND payload delivered
 *   1 - scrape degraded (error payload delivered; app records the failure)
 *   2 - payload could not be delivered
 *   3 - configuration error (fail fast, nothing sent)
 */
import { ConfigError, loadConfig } from './config.js';
import { log } from './log.js';
import { runScrape } from './pipeline.js';
import { buildPayload, postSync } from './sync.js';

export async function main(): Promise<number> {
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

	log.info('start', 'dimba scraper starting', {
		target: config.megaJackpotUrl,
		syncUrl: config.appSyncUrl,
		headless: config.headless
	});

	const scrape = await runScrape(config);

	const payload = buildPayload({
		pageUrl: scrape.pageUrl,
		method: scrape.method,
		current: scrape.current,
		finished: scrape.finished,
		errors: scrape.errors
	});

	log.info('payload', 'built sync payload', {
		status: payload.run.status,
		currentEvents: payload.current?.events.length ?? 0,
		finishedRounds: payload.finished.length,
		message: payload.run.message
	});

	const post = await postSync(payload, {
		appSyncUrl: config.appSyncUrl,
		secret: config.internalSyncSecret,
		retries: config.postRetries,
		backoffMs: config.postBackoffMs
	});

	if (!post.ok) {
		log.error('end', `sync delivery failed: ${post.message}`);
		return 2;
	}
	if (payload.run.status !== 'ok') {
		log.error('end', `scrape degraded; error payload delivered: ${payload.run.message}`);
		return 1;
	}
	log.info('end', 'scrape + sync complete');
	return 0;
}

const isDirectRun =
	process.argv[1] !== undefined &&
	(import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
		import.meta.url.endsWith('/index.ts') ||
		import.meta.url.endsWith('/index.js'));

if (isDirectRun) {
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((err: unknown) => {
			log.error('fatal', (err as Error).stack ?? String(err));
			process.exitCode = 2;
		});
}
