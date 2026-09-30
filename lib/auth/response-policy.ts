export function withNoStoreHeaders(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return { ...init, headers };
}
