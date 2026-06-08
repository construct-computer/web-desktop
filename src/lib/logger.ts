import {
  configureSync,
  getConfig,
  getLogger,
  type LogRecord,
  type Sink,
} from '@logtape/logtape';

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; fn: (...args: unknown[]) => void }> = {
  debug: { label: 'DEBUG', color: '#888',    fn: console.debug },
  info:  { label: 'INFO ', color: '#0ea5e9', fn: console.log },
  warn:  { label: 'WARN ', color: '#eab308', fn: console.warn },
  error: { label: 'ERROR', color: '#ef4444', fn: console.error },
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']
const configuredLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined)
const minLevel: LogLevel = configuredLevel && LOG_LEVELS.includes(configuredLevel) ? configuredLevel : 'info'
const minIdx = LOG_LEVELS.indexOf(minLevel)
const APP_VERSION = import.meta.env.VITE_APP_VERSION || (typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'unknown')

declare const __GIT_HASH__: string | undefined

function timestamp(): string {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function message(record: LogRecord): unknown[] {
  return record.message.map((part) => part instanceof Error ? part.message : part)
}

function frontendSink(): Sink {
  return (record) => {
    const level = record.level === 'warning' ? 'warn' : record.level === 'fatal' ? 'error' : record.level
    if (level !== 'debug' && level !== 'info' && level !== 'warn' && level !== 'error') return
    if (LOG_LEVELS.indexOf(level) < minIdx) return
    const { label, color, fn } = LEVEL_CONFIG[level]
    const module = record.category.join(':').replace(/^construct:frontend:?/, '') || 'App'
    fn(
      `%c${timestamp()} %c${label}%c [${module}]`,
      'color: #888',
      `color: ${color}; font-weight: bold`,
      'color: #888',
      ...message(record),
      Object.keys(record.properties).length > 0 ? record.properties : '',
    )
  }
}

function configureFrontendLogger(): void {
  if (getConfig()) return
  configureSync({
    sinks: { console: frontendSink() },
    loggers: [
      {
        category: ['construct', 'frontend'],
        sinks: ['console'],
        lowestLevel: minLevel === 'warn' ? 'warning' : minLevel,
      },
      {
        category: ['logtape'],
        sinks: ['console'],
        lowestLevel: 'error',
      },
    ],
  })
}

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * Create a scoped logger for a module.
 *
 *   const logger = log('WebSocket')
 *   logger.info('Connected')
 */
export function log(module: string): Logger {
  configureFrontendLogger()
  const tape = getLogger(['construct', 'frontend', ...module.split(':').filter(Boolean)]).with({
    environment: import.meta.env.MODE,
    release: APP_VERSION,
  })
  function write(level: LogLevel, args: unknown[]): void {
    if (LOG_LEVELS.indexOf(level) < minIdx) return
    const text = args.length > 0 && typeof args[0] === 'string' ? args[0] : 'event'
    const rest = args.length > 0 && typeof args[0] === 'string' ? args.slice(1) : args
    const props = rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null
      ? rest[0] as Record<string, unknown>
      : rest.length > 0 ? { values: rest } : undefined
    if (level === 'warn') tape.warn(text, props)
    else tape[level](text, props)
  }

  return {
    debug: (...args) => write('debug', args),
    info:  (...args) => write('info', args),
    warn:  (...args) => write('warn', args),
    error: (...args) => write('error', args),
  }
}
