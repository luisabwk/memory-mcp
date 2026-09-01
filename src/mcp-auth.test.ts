import { describe, it, expect, vi } from 'vitest';
import { serviceTokenValid, makeMcpAuth } from './mcp-auth.js';

describe('serviceTokenValid', () => {
  it('true quando o Bearer bate com o service token', () => {
    expect(serviceTokenValid('Bearer s3cr3t', 's3cr3t')).toBe(true);
  });
  it('false quando não bate', () => {
    expect(serviceTokenValid('Bearer wrong', 's3cr3t')).toBe(false);
  });
  it('false quando não há service token configurado', () => {
    expect(serviceTokenValid('Bearer s3cr3t', undefined)).toBe(false);
  });
  it('false para esquema não-Bearer', () => {
    expect(serviceTokenValid('Basic s3cr3t', 's3cr3t')).toBe(false);
  });
  it('false para header ausente', () => {
    expect(serviceTokenValid(undefined, 's3cr3t')).toBe(false);
  });
  it('false para header em array', () => {
    expect(serviceTokenValid(['Bearer s3cr3t'], 's3cr3t')).toBe(false);
  });
});

describe('makeMcpAuth', () => {
  it('aceita service token na porta interna sem chamar o OAuth bearer', () => {
    const next = vi.fn();
    const oauthBearer = vi.fn();
    const mw = makeMcpAuth({ internalPort: 8767, serviceToken: 'svc', serviceTokenUserEmail: 'luisa.barwinski@gmail.com', oauthBearer });
    const req: any = { socket: { localPort: 8767 }, headers: { authorization: 'Bearer svc' } };
    mw(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(oauthBearer).not.toHaveBeenCalled();
    // Confirmed by Lu (2026-09-01): the service token maps to her identity by
    // default. server.ts reads exactly this field (extra.email) to scope the call.
    expect(req.auth).toEqual({
      token: 'internal-service',
      clientId: 'internal-service',
      scopes: [],
      extra: { email: 'luisa.barwinski@gmail.com' },
    });
  });

  it('sem serviceTokenUserEmail configurado, a identidade de serviço não carrega email (server.ts deve recusar)', () => {
    const next = vi.fn();
    const oauthBearer = vi.fn();
    const mw = makeMcpAuth({ internalPort: 8767, serviceToken: 'svc', serviceTokenUserEmail: undefined, oauthBearer });
    const req: any = { socket: { localPort: 8767 }, headers: { authorization: 'Bearer svc' } };
    mw(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth.extra).toBeUndefined();
  });

  it('na porta pública, service token é ignorado e cai pro OAuth bearer', () => {
    const next = vi.fn();
    const oauthBearer = vi.fn();
    const mw = makeMcpAuth({ internalPort: 8767, serviceToken: 'svc', serviceTokenUserEmail: 'luisa.barwinski@gmail.com', oauthBearer });
    const req: any = { socket: { localPort: 3000 }, headers: { authorization: 'Bearer svc' } };
    mw(req, {} as any, next);
    expect(oauthBearer).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('na porta interna com token errado, cai pro OAuth bearer', () => {
    const next = vi.fn();
    const oauthBearer = vi.fn();
    const mw = makeMcpAuth({ internalPort: 8767, serviceToken: 'svc', serviceTokenUserEmail: 'luisa.barwinski@gmail.com', oauthBearer });
    const req: any = { socket: { localPort: 8767 }, headers: { authorization: 'Bearer nope' } };
    mw(req, {} as any, next);
    expect(oauthBearer).toHaveBeenCalledTimes(1);
  });

  it('na porta interna sem service token configurado, cai pro OAuth bearer', () => {
    const next = vi.fn();
    const oauthBearer = vi.fn();
    const mw = makeMcpAuth({ internalPort: 8767, serviceToken: undefined, oauthBearer });
    const req: any = { socket: { localPort: 8767 }, headers: { authorization: 'Bearer svc' } };
    mw(req, {} as any, next);
    expect(oauthBearer).toHaveBeenCalledTimes(1);
  });
});
