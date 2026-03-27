// uid — generates a UUID v4 via the Web Crypto API.
// Never use Math.random() or Date.now() for identifiers.
export function uid(): string {
  return crypto.randomUUID();
}
