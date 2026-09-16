/**
 * The reason main refused a request on purpose, or null for any other failure.
 * A refusal is thrown in main as a `Rejection`, and Electron hands it to the
 * renderer as "Error invoking remote method '…': Rejection: <reason>": main
 * sends `error.toString()`, so the class name is the marker, and nothing follows
 * the reason (checked on Electron 44). The `s` flag keeps a multi-line reason whole.
 */
export function rejectionReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /Rejection: (.+)$/s.exec(message);
  return match ? match[1].trim() : null;
}
