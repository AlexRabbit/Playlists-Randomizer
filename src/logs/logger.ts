export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  channel: string;
  message: string;
  data?: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

class Logger {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(e: LogEntry) => void>();
  private minLevel: LogLevel;

  constructor() {
    const env = import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined;
    this.minLevel = env && env in LEVEL_ORDER ? env : 'debug';
  }

  private emit(level: LogLevel, channel: string, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const entry: LogEntry = {
      id: this.nextId++,
      ts: new Date().toISOString(),
      level,
      channel,
      message,
      data,
    };
    this.entries.push(entry);
    const max = Number(import.meta.env.VITE_LOG_MAX_ENTRIES) || 5000;
    if (this.entries.length > max) this.entries.splice(0, this.entries.length - max);

    const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${channel}]`;
    const style =
      level === 'error' || level === 'fatal'
        ? 'color:#ff6b6b;font-weight:bold'
        : level === 'warn'
          ? 'color:#ffd93d'
          : 'color:#6bcfff';
    console.log(`%c${prefix} ${message}`, style, data ?? '');

    for (const fn of this.listeners) fn(entry);
  }

  trace(ch: string, msg: string, data?: unknown) {
    this.emit('trace', ch, msg, data);
  }
  debug(ch: string, msg: string, data?: unknown) {
    this.emit('debug', ch, msg, data);
  }
  info(ch: string, msg: string, data?: unknown) {
    this.emit('info', ch, msg, data);
  }
  warn(ch: string, msg: string, data?: unknown) {
    this.emit('warn', ch, msg, data);
  }
  error(ch: string, msg: string, data?: unknown) {
    this.emit('error', ch, msg, data);
  }
  fatal(ch: string, msg: string, data?: unknown) {
    this.emit('fatal', ch, msg, data);
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
    this.info('logger', 'Log buffer cleared');
  }

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}

export const log = new Logger();
