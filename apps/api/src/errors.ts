/** A caught error's message, for logs and failure reasons; never a stack trace. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
