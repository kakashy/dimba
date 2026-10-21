import { json } from '@sveltejs/kit';
import { PUBLIC_VAPID_PUBLIC_KEY } from '$app/env/public';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (): Response => {
	return json({ publicKey: PUBLIC_VAPID_PUBLIC_KEY || null });
};
