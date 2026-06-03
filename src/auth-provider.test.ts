import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { InMemoryOAuthProvider } from './auth-provider.js';

function fakeBroker() {
  return { startLogin: vi.fn(() => 'https://accounts.google.com/login?mock') };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
});

describe('authorize', () => {
  it('NÃO auto-aprova: delega ao broker e redireciona pro Google', async () => {
    const broker = fakeBroker();
    const provider = new InMemoryOAuthProvider(broker as any);
    const res: any = { redirect: vi.fn() };
    await provider.authorize(
      { client_id: 'c1' } as any,
      { redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], state: 's' } as any,
      res,
    );
    expect(broker.startLogin).toHaveBeenCalledWith({
      clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], state: 's',
    });
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/login?mock');
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('issueMcpCode', () => {
  it('insere o auth code e redireciona ao redirectUri do cliente com code+state', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    const res: any = { redirect: vi.fn() };
    await provider.issueMcpCode(
      { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], state: 's' },
      res,
    );
    expect(insertMock).toHaveBeenCalledTimes(1);
    const url = res.redirect.mock.calls[0][0] as string;
    expect(url).toContain('https://app/cb?');
    expect(url).toContain('code=code_');
    expect(url).toContain('state=s');
  });

  it('omite state quando não fornecido', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    const res: any = { redirect: vi.fn() };
    await provider.issueMcpCode(
      { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: [] },
      res,
    );
    const url = res.redirect.mock.calls[0][0] as string;
    expect(url).not.toContain('state=');
  });
});
