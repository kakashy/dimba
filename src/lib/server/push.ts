import webpush from 'web-push';
import { db } from '#lib/server/db';
import { pushSubscriptions } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import { PUBLIC_VAPID_PUBLIC_KEY } from '$app/env/public';

let configured = false;
if (VAPID_PRIVATE_KEY && PUBLIC_VAPID_PUBLIC_KEY) {
	webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:dimba@example.com', PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
	configured = true;
}

export interface PushResult {
	sent: number;
	pruned: number;
	errors: Array<{ endpoint: string; status: number | null; message: string }>;
}

/**
 * Send one payload to every stored push subscription. Prunes dead ones
 * (404/410) so they don't accumulate. Best-effort: never throws.
 */
export async function broadcastPush(payload: { title: string; body: string; url?: string }): Promise<PushResult> {
	const subs = await db.select().from(pushSubscriptions);
	let sent = 0;
	let pruned = 0;
	const errors: PushResult['errors'] = [];

	for (const sub of subs) {
		const subscription = {
			endpoint: sub.endpoint,
			keys: { p256dh: sub.p256dh, auth: sub.auth }
		};
		try {
			await webpush.sendNotification(
				subscription,
				JSON.stringify(payload),
				{ TTL: 60 * 60 * 24, urgency: 'normal', topic: 'dimba-results' }
			);
			sent += 1;
		} catch (err: unknown) {
			const e = err as { statusCode?: number; headers?: Record<string, string>; message: string };
			if (e.statusCode === 404 || e.statusCode === 410) {
				await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
				pruned += 1;
			} else {
				errors.push({ endpoint: sub.endpoint, status: e.statusCode ?? null, message: e.message });
			}
		}
	}

	return { sent, pruned, errors };
}

export { configured };
