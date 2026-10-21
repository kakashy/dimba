type Level = 'info' | 'warn' | 'error';

function emit(level: Level, step: string, message: string, extra?: Record<string, unknown>): void {
	const ts = new Date().toISOString();
	const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
	const line = `${ts} [${level}] [${step}] ${message}${suffix}`;
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

export const log = {
	info: (step: string, message: string, extra?: Record<string, unknown>) => emit('info', step, message, extra),
	warn: (step: string, message: string, extra?: Record<string, unknown>) => emit('warn', step, message, extra),
	error: (step: string, message: string, extra?: Record<string, unknown>) => emit('error', step, message, extra)
};
