import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  [key: string]: unknown;
}

let logDirReady = false;

function getLogDir(): string {
  return process.env.LOG_DIR ?? path.resolve(process.cwd(), 'logs');
}

function getLogFilePath(): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return path.join(getLogDir(), `api-${date}.log`);
}

async function ensureLogDir(): Promise<void> {
  if (logDirReady) {
    return;
  }
  await mkdir(getLogDir(), { recursive: true });
  logDirReady = true;
}

function serialize(level: LogLevel, message: string, context?: LogContext): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    context: context ?? {},
  });
}

async function writeLine(line: string): Promise<void> {
  await ensureLogDir();
  await appendFile(getLogFilePath(), `${line}\n`, 'utf-8');
}

function print(level: LogLevel, line: string): void {
  if (level === 'ERROR') {
    console.error(line);
    return;
  }
  if (level === 'WARN') {
    console.warn(line);
    return;
  }
  console.log(line);
}

async function log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
  const line = serialize(level, message, context);
  print(level, line);
  try {
    await writeLine(line);
  } catch {
    // Keep business flow available even when log disk write fails.
  }
}

export function info(message: string, context?: LogContext): void {
  void log('INFO', message, context);
}

export function warn(message: string, context?: LogContext): void {
  void log('WARN', message, context);
}

export function error(message: string, context?: LogContext): void {
  void log('ERROR', message, context);
}
