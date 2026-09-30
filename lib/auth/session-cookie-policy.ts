/**
 * Session cookies are secure by default. Only the validated temporary HTTP
 * deployment mode may opt out with the exact server-side value `false`.
 */
export function shouldUseSecureSessionCookies(value = process.env.SESSION_COOKIE_SECURE) {
  return value !== "false";
}
