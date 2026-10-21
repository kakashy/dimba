declare module 'web-push' {
	export interface PushSubscription {
		endpoint: string;
		keys: { p256dh: string; auth: string };
		expirationTime?: number | null;
	}
	export function setVapidDetails(
		subject: string,
		publicKey: string,
		privateKey: string
	): void;
	export function sendNotification(
		subscription: PushSubscription,
		payload: string | Buffer,
		options?: {
			TTL?: number;
			urgency?: 'very-low' | 'low' | 'normal' | 'high';
			topic?: string;
			timeout?: number;
		}
	): Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
	export class WebPushError extends Error {
		statusCode: number;
		headers: Record<string, string>;
		constructor(message: string, statusCode: number, headers: Record<string, string>);
	}
	export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}
