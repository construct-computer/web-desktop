/**
 * Structured logger for the frontend.
 *
 * Usage:
 *   import { log } from '@/lib/logger'
 *   const logger = log('WebSocket')
 *   logger.info('Connected to backend')
 *   logger.error('Connection lost', err.message)
 *
 * Output (in browser console):
 *   12:30:45 INFO  [WebSocket] Connected to backend
 *   12:30:45 ERROR [WebSocket] Connection lost
 *
 * Uses CSS-styled console output for colored module tags and levels.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; fn: (...args: unknown[]) => void }> = {
  debug: { label: 'DEBUG', color: '#888',    fn: console.debug },
  info:  { label: 'INFO ', color: '#0ea5e9', fn: console.log },
  warn:  { label: 'WARN ', color: '#eab308', fn: console.warn },
  error: { label: 'ERROR', color: '#ef4444', fn: console.error },
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']
const minLevel: LogLevel = 'info'
const minIdx = LOG_LEVELS.indexOf(minLevel)

function timestamp(): string {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
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
  function write(level: LogLevel, args: unknown[]): void {
    if (LOG_LEVELS.indexOf(level) < minIdx) return
    const { label, color, fn } = LEVEL_CONFIG[level]
    fn(
      `%c${timestamp()} %c${label}%c [${module}]`,
      'color: #888',
      `color: ${color}; font-weight: bold`,
      'color: #888',
      ...args,
    )
  }

  return {
    debug: (...args) => write('debug', args),
    info:  (...args) => write('info', args),
    warn:  (...args) => write('warn', args),
    error: (...args) => write('error', args),
  }
}
