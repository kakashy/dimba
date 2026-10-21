import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ timezoneId: 'Africa/Nairobi', locale: 'en-KE' });
await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((t) => t);' });
const page = await context.newPage();
await page.goto('https://www.ke.sportpesa.com/en/mega-jackpot-pro', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 30; i++) {
	if (!/challenge/i.test(await page.title())) break;
	await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);

const urls = [
	'https://jackpot-offer-api.ke.sportpesa.com/api/jackpots/active',
	'https://jackpot-offer-api.ke.sportpesa.com/api/jackpots/active?type=multi',
	'https://jackpot-offer-api.ke.sportpesa.com/api/jackpots'
];
for (const url of urls) {
	try {
		const res = await context.request.get(url, { headers: { accept: 'application/json' } });
		const t = await res.text();
		console.log(`\n### ${res.status()} ${url} (${t.length}b)\n${t.slice(0, 3500)}`);
	} catch (e) {
		console.log('ERR', url, (e as Error).message.slice(0, 150));
	}
}
await browser.close();
