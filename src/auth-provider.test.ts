import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fake for the four Mongo collections auth-provider.ts touches, keyed by
// collection name so each call to db.collection(name) returns the same fake store.
const stores = new Map<string, Map<string, any>>();
function storeFor(name: string): Map<string, any> {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name)!;
}

function makeFakeCollection(name: string) {
  const store = storeFor(name);
  return {
    insertOne: vi.fn(async (doc: any) => {
      store.set(doc._id, doc);
      return { insertedId: doc._id };
    }),
    findOne: vi.fn(async (filter: any) => store.get(filter._id) ?? null),
    deleteOne: vi.fn(async (filter: any) => {
      const existed = store.delete(filter._id);
      return { deletedCount: existed ? 1 : 0 };
    }),
  };
}

const fakeDb = {
  collection: vi.fn((name: string) => makeFakeCollection(name)),
};

vi.mock('mongodb', () => ({
  MongoClient: vi.fn(),
}));
vi.mock('./services/mongo.js', () => ({
  getMongoDb: vi.fn(async () => fakeDb),
}));

import { InMemoryOAuthProvider } from './auth-provider.js';

function fakeBroker() {
  return { startLogin: vi.fn(() => 'https://accounts.google.com/login?mock') };
}

beforeEach(() => {
  vi.clearAllMocks();
  stores.clear();
  process.env.MONGODB_URI = 'mongodb://x';
  process.env.MONGODB_DB = 'memory_mcp';
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
    expect(res.redirect).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/login?mock');
    expect(storeFor('oauth_auth_codes').size).toBe(0);
  });
});

describe('issueMcpCode', () => {
  it('só aceita um pending com email verificado, insere o auth code com esse email, e redireciona', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    const res: any = { redirect: vi.fn() };
    await provider.issueMcpCode(
      { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], state: 's', email: 'luisa.barwinski@gmail.com' },
      res,
    );
    const inserted = [...storeFor('oauth_auth_codes').values()][0];
    expect(inserted).toMatchObject({
      client_id: 'c1',
      code_challenge: 'ch',
      redirect_uri: 'https://app/cb',
      scopes: ['memory'],
      email: 'luisa.barwinski@gmail.com',
    });
    expect(inserted._id).toMatch(/^code_/);
    expect(res.redirect).toHaveBeenCalledTimes(1);
    const url = res.redirect.mock.calls[0][0] as string;
    expect(url).toContain('https://app/cb?');
    expect(url).toContain('code=code_');
    expect(url).toContain('state=s');
  });

  it('omite state quando não fornecido', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    const res: any = { redirect: vi.fn() };
    await provider.issueMcpCode(
      { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: [], email: 'luisa.barwinski@gmail.com' },
      res,
    );
    const url = res.redirect.mock.calls[0][0] as string;
    expect(url).not.toContain('state=');
  });
});

describe('identity threading: code → access token → refresh token → verifyAccessToken', () => {
  it('carrega o e-mail verificado do auth code até AuthInfo.extra.email', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    const res: any = { redirect: vi.fn() };

    await provider.issueMcpCode(
      { clientId: 'c1', redirectUri: 'https://app/cb', codeChallenge: 'ch', scopes: ['memory'], email: 'guilhermeconter@gmail.com' },
      res,
    );
    const code = res.redirect.mock.calls[0][0].match(/code=(code_[a-f0-9]+)/)[1];

    const tokens = await provider.exchangeAuthorizationCode({ client_id: 'c1' } as any, code);
    expect(tokens.access_token).toMatch(/^at_/);

    const authInfo = await provider.verifyAccessToken(tokens.access_token);
    expect(authInfo.extra).toEqual({ email: 'guilhermeconter@gmail.com' });

    // The refresh token carries the same identity forward.
    const refreshed = await provider.exchangeRefreshToken({ client_id: 'c1' } as any, tokens.refresh_token!);
    const refreshedAuthInfo = await provider.verifyAccessToken(refreshed.access_token);
    expect(refreshedAuthInfo.extra).toEqual({ email: 'guilhermeconter@gmail.com' });
  });

  it('verifyAccessToken lança para token desconhecido (não devolve identidade nenhuma)', async () => {
    const provider = new InMemoryOAuthProvider(fakeBroker() as any);
    await expect(provider.verifyAccessToken('at_does_not_exist')).rejects.toThrow(/Invalid access token/);
  });
});
