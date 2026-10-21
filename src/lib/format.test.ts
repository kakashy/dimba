import { describe, expect, it } from 'vitest';
import { formatPrize, formatKickoff, countdown, scorePicksLocal } from '#lib/format';

describe('formatPrize', () => {
	it('formats with KSH prefix and commas', () => {
		expect(formatPrize('137290997')).toBe('KSH 137,290,997');
	});
	it('handles null', () => {
		expect(formatPrize(null)).toBe('—');
	});
});

describe('formatKickoff', () => {
	it('renders en-KE short date', () => {
		expect(formatKickoff('2026-10-24T17:00:00Z')).toContain('24/10');
		expect(formatKickoff(null)).toBe('—');
	});
});

describe('countdown', () => {
	it('returns null in the past', () => {
		expect(countdown('2000-01-01T00:00:00Z')).toBeNull();
	});
	it('returns null when missing', () => {
		expect(countdown(null)).toBeNull();
	});
});

describe('scorePicksLocal', () => {
	it('scores correct picks', () => {
		const picks: ('1' | 'X' | '2' | null)[] = ['1', 'X', null, '2'];
		const results: ('1' | 'X' | '2' | null)[] = ['1', '1', 'X', '2'];
		expect(scorePicksLocal(picks, results)).toBe(2);
	});
	it('treats null as not correct', () => {
		expect(scorePicksLocal(['1', null], ['1', '1'])).toBe(1);
	});
});
