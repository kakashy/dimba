import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	PUBLIC_VAPID_PUBLIC_KEY: {
		public: true,
		default: '',
		description: 'VAPID public key for web push subscription (client-visible).'
	},
	VAPID_PRIVATE_KEY: {
		default: '',
		description: 'VAPID private key for sending push (server-only, Secret Manager).'
	},
	VAPID_SUBJECT: {
		description: 'mailto contact advertised to push services (server-only).'
	},
	INTERNAL_SYNC_SECRET: {
		description: 'Shared secret protecting /api/internal/sync (scraper↔app).'
	}
});
