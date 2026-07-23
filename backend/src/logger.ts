type Level = 'debug' | 'info' | 'warn' | 'error';

const isProd = process.env.NODE_ENV === 'production';

function formatDev(level: Level, context: string, message: string, data?: Record<string, unknown>): string {
  const time = new Date().toISOString().slice(11, 23);
  const levelPad = level.toUpperCase().padEnd(5);
  const dataStr = data && Object.keys(data).length > 0 ? ' ' + JSON.stringify(data) : '';
  return `[${time}] ${levelPad} [${context}] ${message}${dataStr}`;
}

function log(level: Level, context: string, message: string, data?: Record<string, unknown>): void {
  if (isProd) {
    const entry = { level, context, message, ts: new Date().toISOString(), ...data };
    const serialized = JSON.stringify(entry);
    if (level === 'error') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.log(serialized);
  } else {
    const str = formatDev(level, context, message, data);
    if (level === 'error') console.error(str);
    else if (level === 'warn') console.warn(str);
    else console.log(str);
  }
}

export const logger = {
  debug: (ctx: string, msg: string, data?: Record<string, unknown>) => log('debug', ctx, msg, data),
  info:  (ctx: string, msg: string, data?: Record<string, unknown>) => log('info', ctx, msg, data),
  warn:  (ctx: string, msg: string, data?: Record<string, unknown>) => log('warn', ctx, msg, data),
  error: (ctx: string, msg: string, data?: Record<string, unknown>) => log('error', ctx, msg, data),
};
