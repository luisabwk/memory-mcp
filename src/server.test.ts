import { describe, it, expect } from 'vitest';
import { resolveUserId } from './server.js';

/**
 * resolveUserId is the single gate every tool call passes through to get a
 * user_id. This is the security-critical path: get it wrong and one user's tool
 * call can read or write another user's memories. Covers the three real
 * transports/situations: OAuth bearer with identity, service-token bypass with
 * identity, stdio with an explicit local user, and every way this could fail
 * unsafe (missing email, empty email, no auth at all).
 */
describe('resolveUserId', () => {
  it('usa authInfo.extra.email quando presente (fluxo OAuth ou service-token)', () => {
    const result = resolveUserId({ extra: { email: 'luisa.barwinski@gmail.com' } }, undefined);
    expect(result).toEqual({ ok: true, userId: 'luisa.barwinski@gmail.com' });
  });

  it('recusa quando authInfo existe mas não carrega email — NUNCA cai para um pool compartilhado', () => {
    const result = resolveUserId({ extra: {} }, 'fallback@example.com');
    expect(result.ok).toBe(false);
  });

  it('recusa quando authInfo.extra é undefined', () => {
    const result = resolveUserId({ extra: undefined }, undefined);
    expect(result.ok).toBe(false);
  });

  it('recusa quando authInfo.extra.email não é uma string (ex.: token forjado)', () => {
    const result = resolveUserId({ extra: { email: 12345 as unknown as string } }, undefined);
    expect(result.ok).toBe(false);
  });

  it('recusa email vazio', () => {
    const result = resolveUserId({ extra: { email: '' } }, undefined);
    expect(result.ok).toBe(false);
  });

  it('usa stdioUserEmail só quando não há authInfo nenhum (transporte stdio de verdade)', () => {
    const result = resolveUserId(undefined, 'luisa.barwinski@gmail.com');
    expect(result).toEqual({ ok: true, userId: 'luisa.barwinski@gmail.com' });
  });

  it('recusa quando não há authInfo nem stdioUserEmail — nunca inventa um dono', () => {
    const result = resolveUserId(undefined, undefined);
    expect(result.ok).toBe(false);
  });

  it('authInfo autenticado sempre vence sobre stdioUserEmail — nunca mistura os dois canais', () => {
    // Mesmo com um stdioUserEmail configurado, uma sessão HTTP autenticada (ainda
    // que sem email) nunca deve "cair" silenciosamente pro usuário do stdio.
    const result = resolveUserId({ extra: {} }, 'someone-else@example.com');
    expect(result.ok).toBe(false);
  });
});
