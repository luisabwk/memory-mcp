#!/usr/bin/env node

/**
 * octoAgent Memory MCP Server (Streamable HTTP + OAuth 2.1)
 * Serves MCP over HTTP with OAuth 2.1 authentication (DCR + PKCE).
 * Required for claude.ai remote MCP integration.
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
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMemoryMcpServer } from './server.js';
import { InMemoryOAuthProvider } from './auth-provider.js';
import { GoogleBroker, BrokerError } from './google-broker.js';
import { makeMcpAuth } from './mcp-auth.js';

dotenv.config();

const PUBLIC_PORT = parseInt(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? '3000', 10);
const INTERNAL_PORT = parseInt(process.env.INTERNAL_PORT ?? '8767', 10);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PUBLIC_PORT}`;

/** Idle MCP sessions are removed after this many ms (default 2h). */
const SESSION_TTL_MS = parseInt(process.env.MCP_SESSION_TTL_MS ?? String(2 * 60 * 60 * 1000), 10);
const SESSION_SWEEP_MS = parseInt(process.env.MCP_SESSION_SWEEP_MS ?? String(15 * 60 * 1000), 10);

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: Server;
  lastSeen: number;
};

const sessions = new Map<string, SessionEntry>();

function sweepIdleSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastSeen <= SESSION_TTL_MS) continue;
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
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(BASE_URL),
      baseUrl: new URL(BASE_URL),
      serviceDocumentationUrl: new URL('https://github.com/luisabwk/memory-mcp'),
    })
  );

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
    } catch (err) {
      const status = err instanceof BrokerError ? err.status : 500;
      const msg = err instanceof Error ? err.message : 'erro';
      res.status(status).send(`<!doctype html><meta charset="utf-8"><h1>Acesso negado (${status})</h1><p>${msg}</p>`);
    }
  });

  // MCP endpoint: porta pública só aceita OAuth bearer; porta interna também aceita service token.
  const oauthBearer = requireBearerAuth({ verifier: oauthProvider });
  const mcpAuth = makeMcpAuth({
    internalPort: INTERNAL_PORT,
    serviceToken: process.env.MEMORY_SERVICE_TOKEN,
    oauthBearer,
  });

  setInterval(sweepIdleSessions, SESSION_SWEEP_MS).unref();

  app.all('/mcp', mcpAuth, async (req, res) => {
    const raw = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(raw) ? raw[0] : raw;

    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      entry.lastSeen = Date.now();
      const parsed = req.method === 'POST' ? req.body : undefined;
      await entry.transport.handleRequest(req, res, parsed);
      return;
    }

    if (req.method !== 'POST' || req.body === undefined || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message:
            'Bad Request: first request must be POST with JSON-RPC initialize (no mcp-session-id), or send a valid mcp-session-id from that session',
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
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
