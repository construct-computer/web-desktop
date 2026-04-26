/** Matches worker abort reason `user:stop` / `user:interrupt` (and other actors). */
export function isAgentUserCancelErrorMessage(message: string): boolean {
  return /^[^:]+:(?:stop|interrupt)$/.test(String(message).trim());
}
