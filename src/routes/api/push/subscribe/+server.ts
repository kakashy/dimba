import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '#lib/server/db';
import { pushSubscriptions } from '#lib/server/db/schema';

const bodySchema = z.object({
	endpoint: z.string().url().max(2048),
	p256dh: z.string().min(1).max(512),
	auth: z.string().min(1).max(512),
	expirationTime: z.number().nullable().optional(),
	userAgent: z.string().max(1024).optional()
});

export const POST: RequestHandler = async ({ request }): Promise<Response> => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'Invalid body' }, { status: 400 });
	}
	const { endpoint, p256dh, auth, expirationTime, userAgent: clientUa } = parsed.data;

	await db
		.insert(pushSubscriptions)
		.values({
			endpoint,
			p256dh,
			auth,
			expirationTime: expirationTime ? new Date(expirationTime) : null,
			userAgent: clientUa ?? request.headers.get('user-agent'),
			failures: 0
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { p256dh, auth, expirationTime: expirationTime ? new Date(expirationTime) : null, failures: 0 }
		});

	return json({ ok: true });
};
