/**
 * The one place the API writes diagnostics. Structured JSON lines, so there is
 * never a stray `console.log` in the codebase (CODING_STANDARDS, General).
 */
type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const entry = {
    level,
    msg,
    time: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  };
  const line = `${JSON.stringify(entry)}\n`;
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
