// sanitizeUrl — mandatory XSS prevention for all user-provided href values.
// Returns '#' for any URL with a dangerous scheme (javascript:, data:, vbscript:, etc.).
// Always call this before rendering user-provided URLs as href attributes.
const SAFE_SCHEMES = /^(https?|mailto|tel|ftp):\/\//i;
const RELATIVE     = /^[/?#]/;

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  if (RELATIVE.test(trimmed)) return trimmed;
  if (SAFE_SCHEMES.test(trimmed)) return trimmed;
  return '#';
}
