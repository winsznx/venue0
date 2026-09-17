const SECRET_KEY_PATTERN = /(private|secret|password|share|apikey|api_key|token|signature_material|mnemonic)/i;

export type LogFields = Record<string, unknown>;

/** Structured JSON logs. Keys that look like secrets are redacted before they reach stdout. */
export function log(event: string, fields: LogFields = {}): void {
  const line = { ts: new Date().toISOString(), event, ...redact(fields) };
  console.log(JSON.stringify(line, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)));
}

export function redact(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : v]),
  );
}
