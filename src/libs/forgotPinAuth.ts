export function getPinResetAuthToken(input?: string): string | null {
  const raw =
    input ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!raw) return null;
  try {
    const url = new URL(raw, "http://localhost");
    const token = url.searchParams.get("pinResetAuth");
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function clearPinResetAuthParam(input?: string): string {
  const raw =
    input ?? (typeof window !== "undefined" ? window.location.href : "/");
  try {
    const url = new URL(raw, "http://localhost");
    url.searchParams.delete("pinResetAuth");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
}
