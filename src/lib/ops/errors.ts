/**
 * Typed error thrown by ops. Carries a stable machine `code` (reused from the
 * existing CLI command error codes), a human message, and an optional HTTP status.
 * Commands map it to their `--json`/exit-code output; MCP tools map it to an error
 * tool result. Mirrors the server-side `ServiceError`.
 */
export class DialError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    /** Extra structured context for commands with bespoke error output (e.g. signup's pending_exists). */
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DialError";
  }
}

export function isDialError(e: unknown): e is DialError {
  return e instanceof DialError;
}
