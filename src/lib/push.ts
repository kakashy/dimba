export interface ClientSubscription {
	endpoint: string;
	expirationTime: number | null;
	keys: { p256dh: string; auth: string };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, init);
	if (!res.ok) throw new Error(`${path} → ${res.status}`);
	return (await res.json()) as T;
}

export async function vapidPublicKey(): Promise<string | null> {
	try {
		const { publicKey } = await fetchJSON<{ publicKey: string | null }>('/api/push/vapid-public-key');
		return publicKey ?? null;
	} catch {
		return null;
	}
}

export async function isPushSupported(): Promise<boolean> {
	if (typeof window === 'undefined' || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false;
	try {
		const reg = await navigator.serviceWorker.ready;
		return !!reg.pushManager;
	} catch {
		return false;
	}
}

export async function getExistingSubscription(): Promise<ClientSubscription | null> {
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (!sub) return null;
		const json = sub.toJSON();
		return {
			endpoint: json.endpoint ?? '',
			expirationTime: json.expirationTime ?? null,
			keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }
		};
	} catch {
		return null;
	}
}

export async function subscribeToPush(): Promise<ClientSubscription | null> {
	const key = await vapidPublicKey();
	if (!key) return null;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
		const json = sub.toJSON();
		const keys = json.keys ?? { p256dh: '', auth: '' };
		await fetchJSON('/api/push/subscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				endpoint: json.endpoint ?? '',
				p256dh: keys.p256dh,
				auth: keys.auth,
				expirationTime: json.expirationTime ?? null
			})
		});
		return {
			endpoint: json.endpoint ?? '',
			expirationTime: json.expirationTime ?? null,
			keys: { p256dh: keys.p256dh, auth: keys.auth }
		};
}
