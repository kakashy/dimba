import type { DateLike, PickValue } from '#lib/types';

const PRIZE_RE = /^\d+$/;

/** "137290997" → "KSH 137,290,997" */
export function formatPrize(amount: string | number | null | undefined): string {
	if (amount === null || amount === undefined) return '—';
	const digits = String(amount).replace(/[^0-9]/g, '');
	if (!PRIZE_RE.test(digits)) return '—';
	let s = digits;
	let out = '';
	while (s.length > 3) {
		out = `,${s.slice(-3)}${out}`;
		s = s.slice(0, -3);
	}
	out = `${s}${out}`;
	return `KSH ${out}`;
}

/** ISO → "Fri 24/10 · 17:00" (Africa/Nairobi) */
export function formatKickoff(when: DateLike | null | undefined): string {
	if (!when) return '—';
	const d = new Date(when);
	if (Number.isNaN(d.getTime())) return '—';
	const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
	return eat.toLocaleString('en-KE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
}

/** Milliseconds until instant → "Closes in 2d 4h", null if already past. */
export function countdown(when: DateLike | null | undefined): string | null {
	if (!when) return null;
	const d = new Date(when);
	if (Number.isNaN(d.getTime())) return null;
	const ms = d.getTime() - Date.now();
	if (ms <= 0) return null;
	const days = Math.floor(ms / 86_400_000);
	const hours = Math.floor((ms % 86_400_000) / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	if (days > 0) return `Closes in ${days}d ${hours}h`;
	if (hours > 0) return `Closes in ${hours}h ${minutes}m`;
	return `Closes in ${minutes}m`;
}

/** Correct picks out of results (both arrays indexed by eventNumber - 1). */
export function scorePicksLocal(picks: (PickValue | null)[], results: (PickValue | null)[]): number {
	let correct = 0;
	const len = Math.min(picks.length, results.length);
	for (let i = 0; i < len; i++) {
		if (picks[i] && picks[i] === results[i]) correct += 1;
	}
	return correct;
}
