/// <reference lib="DOM" />

import { assets, immutable } from '$app/manifest';

const sw = self as unknown as ServiceWorkerGlobalScope;
const ASSETS = `dimba-v1`;
const API = `dimba-api-v1`;

const PRECACHE = [...assets, ...immutable];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(ASSETS).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key !== ASSETS && key !== API).map((key) => caches.delete(key)))
		)
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => caches.match('/')));
		return;
	}

	if (url.origin === self.location.origin && url.pathname.startsWith('/api/') && request.method === 'GET') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const copy = response.clone();
					caches.open(API).then((cache) => cache.put(request, copy));
					return response;
				})
				.catch(() => caches.match(request))
		);
		return;
	}

	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(caches.match(request));
		return;
	}
});

sw.addEventListener('push', (event) => {
	const data = (event.data && event.data.json()) || { title: 'Dimba', body: '', url: '/' };
	event.waitUntil(
		sw.registration.showNotification(data.title, {
			body: data.body,
			icon: '/icon.svg',
			badge: '/icon.svg',
			data: { url: data.url }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url ?? '/';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients: WindowClient[]) => {
			const focused = clients.find((client) => client.focused);
			if (focused) {
				return focused.focus().then(() => {
					if (focused.url !== url) return focused.navigate(url);
				});
			}
			return sw.clients.openWindow(url);
		})
	);
});
