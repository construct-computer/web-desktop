type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const configuredLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined);
const minLevel: LogLevel = configuredLevel && LOG_LEVELS.includes(configuredLevel) ? configuredLevel : 'info';
const minIdx = LOG_LEVELS.indexOf(minLevel);
const APP_VERSION = import.meta.env.VITE_APP_VERSION || (typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'unknown');

declare const __GIT_HASH__: string | undefined;

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function timestamp(): string {
  return new Date().toISOString();
}

function stringifyArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return { error: arg.message, stack: arg.stack?.split('\n').slice(0, 4).join('\n') };
    }
    return arg;
  });
}

/**
 * Create a scoped logger for a module. Logs structured JSON.
 *
 *   const logger = log('WebSocket')
 *   logger.info('Connected')
 *   logger.info({ event: 'connection_established', peer: 'server' })
 */
export function log(module: string): Logger {
  const base = {
    app: 'construct-frontend',
    version: APP_VERSION,
    environment: import.meta.env.MODE,
    module,
    timestamp: '',
  };

  function write(level: LogLevel, args: unknown[]): void {
    if (LOG_LEVELS.indexOf(level) < minIdx) return;

    const message = args.length > 0 && typeof args[0] === 'string' ? args[0] : undefined;
    const rest = message ? args.slice(1) : args;
    const extra = rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !(rest[0] instanceof Error)
      ? rest[0] as Record<string, unknown>
      : undefined;

    const payload: Record<string, unknown> = {
      ...base,
      level,
      timestamp: timestamp(),
      event: message || 'event',
      ...extra,
    };

    if (args.some((a) => a instanceof Error)) {
      const errors = args.filter((a) => a instanceof Error).map((e) => ({
        message: (e as Error).message,
        stack: (e as Error).stack?.split('\n').slice(0, 4).join('\n'),
      }));
      payload.errors = errors;
    }

    if (rest.length > 0 && !extra && rest.some((r) => typeof r !== 'string')) {
      payload.args = stringifyArgs(rest);
    }

    if (level === 'debug') console.debug(JSON.stringify(payload));
    else if (level === 'info') console.log(JSON.stringify(payload));
    else if (level === 'warn') console.warn(JSON.stringify(payload));
    else if (level === 'error') console.error(JSON.stringify(payload));
  }

  return {
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}
