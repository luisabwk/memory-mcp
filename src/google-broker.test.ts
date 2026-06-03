import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateAuthUrl = vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock');
const mockGetToken = vi.fn();
const mockVerifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import { GoogleBroker, BrokerError } from './google-broker.js';

const PENDING = { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], state: 's' };

function envOk() {
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'csecret';
  process.env.BASE_URL = 'https://memory.bloko.dev';
  process.env.ALLOWED_EMAILS = 'me@gmail.com';
}

function startAndCaptureSid(b: GoogleBroker): string {
  let sid = '';
  mockGenerateAuthUrl.mockImplementation((opts: any) => { sid = opts.state; return 'https://accounts.google.com/x'; });
  b.startLogin(PENDING);
  return sid;
}

describe('GoogleBroker', () => {
  beforeEach(() => { vi.clearAllMocks(); envOk(); });

  it('constructor lança se faltar env obrigatória', () => {
    delete process.env.ALLOWED_EMAILS;
    expect(() => new GoogleBroker()).toThrow(/ALLOWED_EMAILS/);
  });

  it('startLogin grava pendente e retorna a URL do Google com scope openid email', () => {
    const b = new GoogleBroker();
    const url = b.startLogin(PENDING);
    expect(url).toContain('accounts.google.com');
    const opts = mockGenerateAuthUrl.mock.calls[0][0] as any;
    expect(opts.scope).toEqual(['openid', 'email']);
    expect(typeof opts.state).toBe('string');
    expect(opts.state.length).toBeGreaterThan(16);
  });

  it('verifyCallback devolve o pendente para e-mail allowlisted e verificado', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'me@gmail.com', email_verified: true }) });
    const pending = await b.verifyCallback(sid, 'code123');
    expect(pending.clientId).toBe('c1');
    expect(pending.redirectUri).toBe('https://app/cb');
  });

  it('verifyCallback é case-insensitive no e-mail', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'Me@Gmail.com', email_verified: true }) });
    await expect(b.verifyCallback(sid, 'code')).resolves.toBeTruthy();
  });

  it('verifyCallback rejeita e-mail fora da allowlist com 403', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'intruder@gmail.com', email_verified: true }) });
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 403 });
  });

  it('verifyCallback rejeita e-mail não verificado com 403', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'me@gmail.com', email_verified: false }) });
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 403 });
  });

  it('verifyCallback rejeita state desconhecido com 400', async () => {
    const b = new GoogleBroker();
    await expect(b.verifyCallback('nope', 'code')).rejects.toMatchObject({ status: 400 });
  });

  it('verifyCallback rejeita state ausente com 400', async () => {
    const b = new GoogleBroker();
    await expect(b.verifyCallback(undefined, 'code')).rejects.toMatchObject({ status: 400 });
  });

  it('verifyCallback consome o pendente (não reutilizável)', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'me@gmail.com', email_verified: true }) });
    await b.verifyCallback(sid, 'code');
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 400 });
  });

  it('verifyCallback retorna 502 se o Google não devolver id_token', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: {} });
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 502 });
  });

  it('verifyCallback rejeita code ausente com 400', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    await expect(b.verifyCallback(sid, undefined)).rejects.toMatchObject({ status: 400 });
  });

  it('verifyCallback retorna 502 se getToken lançar', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockRejectedValue(new Error('network'));
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 502 });
  });

  it('verifyCallback retorna 502 se verifyIdToken lançar (assinatura inválida)', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockRejectedValue(new Error('invalid signature'));
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 502 });
  });

  it('verifyCallback retorna 502 se o id_token não trouxer claim email', async () => {
    const b = new GoogleBroker();
    const sid = startAndCaptureSid(b);
    mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email_verified: true }) });
    await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 502 });
  });

  it('verifyCallback rejeita pendente expirado com 400', async () => {
    vi.useFakeTimers();
    try {
      const b = new GoogleBroker();
      const sid = startAndCaptureSid(b);
      mockGetToken.mockResolvedValue({ tokens: { id_token: 'idtok' } });
      mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'me@gmail.com', email_verified: true }) });
      vi.advanceTimersByTime(5 * 60 * 1000 + 1); // passa do TTL de 5min
      await expect(b.verifyCallback(sid, 'code')).rejects.toMatchObject({ status: 400 });
    } finally {
      vi.useRealTimers();
    }
  });
});
