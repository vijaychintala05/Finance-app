import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  organizationId?: string;
  userId?: string;
  durationMs?: number;
  [key: string]: any;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

const contextStorage = new AsyncLocalStorage<LogContext>();

export class StructuredLogger {
  public static runWithContext<T>(context: LogContext, callback: () => T): T {
    const current = contextStorage.getStore() || {};
    return contextStorage.run({ ...current, ...context }, callback);
  }

  public static getContext(): LogContext {
    return contextStorage.getStore() || {};
  }

  public static log(level: LogLevel, message: string, meta?: Record<string, any>, err?: unknown): void {
    const currentContext = contextStorage.getStore() || {};
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...currentContext,
      ...(meta || {}),
    };

    if (err) {
      if (err instanceof Error) {
        entry.error = {
          name: err.name,
          message: err.message,
          stack: err.stack,
          code: (err as any).code,
        };
      } else {
        entry.error = {
          message: String(err),
        };
      }
    }

    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  public static info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  public static warn(message: string, meta?: Record<string, any>, err?: unknown): void {
    this.log('warn', message, meta, err);
  }

  public static error(message: string, err?: unknown, meta?: Record<string, any>): void {
    this.log('error', message, meta, err);
  }

  public static debug(message: string, meta?: Record<string, any>): void {
    if (process.env.DEBUG || process.env.LOG_LEVEL === 'debug') {
      this.log('debug', message, meta);
    }
  }
}
