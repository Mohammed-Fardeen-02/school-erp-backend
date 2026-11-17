import { describe, it, expect, vi } from 'vitest';
import { corsOptions, normalizeOrigin } from './cors';
import { env } from './env';

describe('CORS Configuration Suite', () => {
  it('normalizes origin by trimming whitespace and trailing slashes', () => {
    expect(normalizeOrigin('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeOrigin('  http://localhost:3000///  ')).toBe('http://localhost:3000');
    expect(normalizeOrigin('https://myschool.edu')).toBe('https://myschool.edu');
  });

  it('allows requests with undefined origin (server-to-server, curl, Postman)', () => {
    const callback = vi.fn();
    (corsOptions.origin as Function)(undefined, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows valid frontend origin matching configured CORS_ORIGIN', () => {
    const callback = vi.fn();
    (corsOptions.origin as Function)('http://localhost:3000', callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows frontend origin even if browser sends trailing slash or whitespace', () => {
    const callback = vi.fn();
    (corsOptions.origin as Function)('http://localhost:3000/', callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows localhost and 127.0.0.1 on alternative dev ports in development mode', () => {
    const callbackPort = vi.fn();
    (corsOptions.origin as Function)('http://localhost:5173', callbackPort);
    expect(callbackPort).toHaveBeenCalledWith(null, true);

    const callbackIp = vi.fn();
    (corsOptions.origin as Function)('http://127.0.0.1:3000', callbackIp);
    expect(callbackIp).toHaveBeenCalledWith(null, true);
  });

  it('gracefully denies unauthorized external origin without throwing unhandled exception', () => {
    const callback = vi.fn();
    (corsOptions.origin as Function)('https://malicious-site.com', callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });
});
