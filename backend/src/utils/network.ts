import os from 'os';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** First private IPv4 address of this machine (what a phone on the same Wi-Fi can reach). */
export function lanIPv4(): string | null {
  const candidates: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) candidates.push(i.address);
    }
  }
  const isPrivate = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return candidates.find(isPrivate) ?? candidates[0] ?? null;
}

/** "http://host:port" from an Origin / Referer header, or null when it is not a plain http(s) origin. */
export function parseOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * The address a phone should open after scanning a QR. Priority:
 *   1. PUBLIC_APP_URL (set this in production),
 *   2. the origin of the page the user is on (works on any domain / network without configuration),
 *   3. CLIENT_URL.
 * A localhost address is unreachable from another device, so it is swapped for this machine's LAN address.
 */
export function publicAppOrigin(opts: { configured?: string; requestOrigin?: string | null; fallback: string }): { origin: string; reachable: boolean } {
  const picked = parseOrigin(opts.configured) ?? parseOrigin(opts.requestOrigin) ?? parseOrigin(opts.fallback) ?? opts.fallback;
  try {
    const u = new URL(picked);
    if (LOCAL_HOSTS.has(u.hostname)) {
      const lan = lanIPv4();
      if (lan) {
        u.hostname = lan;
        return { origin: u.origin, reachable: true };
      }
      return { origin: u.origin, reachable: false };
    }
    return { origin: u.origin, reachable: true };
  } catch {
    return { origin: picked.replace(/\/$/, ''), reachable: false };
  }
}
