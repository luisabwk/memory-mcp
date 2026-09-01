#!/usr/bin/env node
/**
 * memory-mcp Server (Streamable HTTP + OAuth 2.1)
 * Serves MCP over HTTP com OAuth 2.1 (DCR + PKCE), gateado por login Google (allowlist).
 * Required for claude.ai remote MCP integration.
 *
 * Duas portas: PUBLIC_PORT (roteada pelo Traefik, só OAuth bearer) e INTERNAL_PORT
 * (só rede Docker, aceita MEMORY_SERVICE_TOKEN para clientes headless).
 *
 * MCP sessions: one StreamableHTTPServerTransport + McpServer per client session
 * (map keyed by mcp-session-id). A single global transport breaks all clients after
 * the first initialize ("Server already initialized").
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMemoryMcpServer } from './server.js';
import { InMemoryOAuthProvider } from './auth-provider.js';
import { GoogleBroker, BrokerError } from './google-broker.js';
import { makeMcpAuth } from './mcp-auth.js';
dotenv.config();
const PUBLIC_PORT = parseInt(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? '3000', 10);
const INTERNAL_PORT = parseInt(process.env.INTERNAL_PORT ?? '8767', 10);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PUBLIC_PORT}`;
/**
 * The internal service-token bypass MUST map to a named identity — confirmed by Lu
 * (2026-09-01): headless/automation clients map to her identity by default, no
 * separate pseudo-user for now. Fail fast at startup rather than let mcp-auth.ts
 * silently mint an AuthInfo with no email whenever MEMORY_SERVICE_TOKEN is set.
 */
function resolveServiceTokenUserEmail() {
    const serviceToken = process.env.MEMORY_SERVICE_TOKEN;
    if (!serviceToken)
        return undefined;
    const email = process.env.SERVICE_TOKEN_USER_EMAIL;
    if (!email) {
        throw new Error('MEMORY_SERVICE_TOKEN is set but SERVICE_TOKEN_USER_EMAIL is missing — refusing to start.');
    }
    const allowed = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    const normalized = email.trim().toLowerCase();
    if (allowed.length > 0 && !allowed.includes(normalized)) {
        throw new Error(`SERVICE_TOKEN_USER_EMAIL (${normalized}) is not in ALLOWED_EMAILS.`);
    }
    return normalized;
}
/** Idle MCP sessions are removed after this many ms (default 24h). */
const SESSION_TTL_MS = parseInt(process.env.MCP_SESSION_TTL_MS ?? String(24 * 60 * 60 * 1000), 10);
const SESSION_SWEEP_MS = parseInt(process.env.MCP_SESSION_SWEEP_MS ?? String(15 * 60 * 1000), 10);
const sessions = new Map();
function sweepIdleSessions() {
    const now = Date.now();
    for (const [id, entry] of sessions) {
        if (now - entry.lastSeen <= SESSION_TTL_MS)
            continue;
        void entry.transport.close();
        void entry.server.close();
        sessions.delete(id);
    }
}
async function main() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    // Broker Google (login + allowlist) — gate de identidade antes de emitir qualquer token.
    const broker = new GoogleBroker();
    const oauthProvider = new InMemoryOAuthProvider(broker);
    // Mount OAuth routes (/.well-known, /authorize, /token, /register)
    app.use(mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl: new URL(BASE_URL),
        baseUrl: new URL(BASE_URL),
        serviceDocumentationUrl: new URL('https://github.com/luisabwk/memory-mcp'),
    }));
    // Health check (no auth)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'memory-mcp', version: '2.1.0' });
    });
    // Callback do Google: prova de identidade antes de emitir o code MCP.
    app.get('/auth/google/callback', async (req, res) => {
        try {
            const state = typeof req.query.state === 'string' ? req.query.state : undefined;
            const code = typeof req.query.code === 'string' ? req.query.code : undefined;
            const pending = await broker.verifyCallback(state, code);
            await oauthProvider.issueMcpCode(pending, res);
        }
        catch (err) {
            console.error('Google callback error:', err);
            const status = err instanceof BrokerError ? err.status : 500;
            // Só mensagens de BrokerError (strings fixas do nosso código) vão pro HTML; demais
            // erros viram mensagem genérica para não refletir conteúdo de terceiros (ex.: Supabase).
            const msg = err instanceof BrokerError ? err.message : 'Internal error';
            res.status(status).send(`<!doctype html><meta charset="utf-8"><h1>Acesso negado (${status})</h1><p>${msg}</p>`);
        }
    });
    // MCP endpoint: porta pública só aceita OAuth bearer; porta interna também aceita service token.
    const oauthBearer = requireBearerAuth({ verifier: oauthProvider });
    const mcpAuth = makeMcpAuth({
        internalPort: INTERNAL_PORT,
        serviceToken: process.env.MEMORY_SERVICE_TOKEN,
        serviceTokenUserEmail: resolveServiceTokenUserEmail(),
        oauthBearer,
    });
    setInterval(sweepIdleSessions, SESSION_SWEEP_MS).unref();
    app.all('/mcp', mcpAuth, async (req, res) => {
        const raw = req.headers['mcp-session-id'];
        const sessionId = Array.isArray(raw) ? raw[0] : raw;
        if (sessionId && sessions.has(sessionId)) {
            const entry = sessions.get(sessionId);
            entry.lastSeen = Date.now();
            const parsed = req.method === 'POST' ? req.body : undefined;
            await entry.transport.handleRequest(req, res, parsed);
            return;
        }
        // Session id enviado mas desconhecido (expirou/foi varrido, ou o servidor reiniciou).
        // Responde 404 — não 400 — para que o cliente MCP re-inicialize sozinho, conforme a spec
        // Streamable HTTP. O 400 anterior travava o cliente sem recuperação (ele reenviava o mesmo
        // session-id morto indefinidamente → "Tool execution failed").
        if (sessionId) {
            res.status(404).json({
                jsonrpc: '2.0',
                error: {
                    code: -32001,
                    message: 'Session not found or expired; please reinitialize (send a POST initialize with no mcp-session-id).',
                },
                id: null,
            });
            return;
        }
        // Sem session id: a primeira requisição precisa ser um initialize.
        if (req.method !== 'POST' || req.body === undefined || !isInitializeRequest(req.body)) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: first request must be POST with JSON-RPC initialize (no mcp-session-id), or send a valid mcp-session-id from that session',
                },
                id: null,
            });
            return;
        }
        const server = await createMemoryMcpServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
                sessions.set(sid, { transport, server, lastSeen: Date.now() });
            },
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    app.listen(PUBLIC_PORT, '0.0.0.0', () => {
        console.error(`memory-mcp (público) ouvindo em http://0.0.0.0:${PUBLIC_PORT}`);
        console.error(`  Base URL:   ${BASE_URL}`);
        console.error(`  OAuth meta: ${BASE_URL}/.well-known/oauth-authorization-server`);
    });
    app.listen(INTERNAL_PORT, '0.0.0.0', () => {
        console.error(`memory-mcp (interno, service token) ouvindo em http://0.0.0.0:${INTERNAL_PORT}`);
        console.error(`  MCP interno: http://0.0.0.0:${INTERNAL_PORT}/mcp`);
    });
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index-http.js.map