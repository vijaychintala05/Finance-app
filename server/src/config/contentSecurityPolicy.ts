/**
 * CSP used for the production SPA shell.
 *
 * Receipt previews and downloaded evidence are represented by browser-local
 * object URLs, so blob: is allowed for images only. It is intentionally not
 * allowed for scripts, frames, or connections.
 */
export const PRODUCTION_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
