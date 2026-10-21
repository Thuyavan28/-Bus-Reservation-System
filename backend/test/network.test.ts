import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import { lanIPv4, parseOrigin, publicAppOrigin } from '../src/utils/network';

describe('payment QR address', () => {
  it('parseOrigin accepts only plain http(s) origins', () => {
    expect(parseOrigin('https://busgo.example.com/path?x=1')).toBe('https://busgo.example.com');
    expect(parseOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(parseOrigin('javascript:alert(1)')).toBeNull();
    expect(parseOrigin('not a url')).toBeNull();
    expect(parseOrigin(undefined)).toBeNull();
  });

  it('keeps the real domain in production / on a LAN address', () => {
    expect(publicAppOrigin({ requestOrigin: 'https://busgo.example.com', fallback: 'http://localhost:5173' })).toEqual({ origin: 'https://busgo.example.com', reachable: true });
    expect(publicAppOrigin({ requestOrigin: 'http://192.168.1.20:5173', fallback: 'http://localhost:5173' }).origin).toBe('http://192.168.1.20:5173');
  });

  it('PUBLIC_APP_URL wins over the request origin', () => {
    expect(publicAppOrigin({ configured: 'https://tickets.example.org', requestOrigin: 'http://localhost:5173', fallback: 'http://localhost:5173' }).origin).toBe('https://tickets.example.org');
  });

  it('swaps localhost for this machine\'s LAN address so a phone can reach it', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({ Wi_Fi: [{ family: 'IPv4', internal: false, address: '10.1.2.3' } as any], lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' } as any] } as any);
    expect(lanIPv4()).toBe('10.1.2.3');
    expect(publicAppOrigin({ requestOrigin: 'http://localhost:5173', fallback: 'http://localhost:5173' })).toEqual({ origin: 'http://10.1.2.3:5173', reachable: true });
    expect(publicAppOrigin({ requestOrigin: 'http://127.0.0.1:5173', fallback: 'http://localhost:5173' }).origin).toBe('http://10.1.2.3:5173');
    vi.restoreAllMocks();
  });

  it('reports unreachable when there is no network address at all', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' } as any] } as any);
    expect(publicAppOrigin({ requestOrigin: 'http://localhost:5173', fallback: 'http://localhost:5173' }).reachable).toBe(false);
    vi.restoreAllMocks();
  });
});
