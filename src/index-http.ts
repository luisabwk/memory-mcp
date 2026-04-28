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

dotenv.config();

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? '8766', 10);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

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

  // OAuth 2.1 provider (auto-approves, in-memory tokens)
  const oauthProvider = new InMemoryOAuthProvider();

  // Mount OAuth routes (/.well-known, /authorize, /token, /register)
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(BASE_URL),
      baseUrl: new URL(BASE_URL),
      serviceDocumentationUrl: new URL('https://github.com/luisabwk/octoAgent'),
    })
  );

  // Health check (no auth)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'memory-mcp', version: '2.0.0' });
  });

  // MCP endpoint with bearer auth
  const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

  setInterval(sweepIdleSessions, SESSION_SWEEP_MS).unref();

  app.all('/mcp', bearerAuth, async (req, res) => {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.error(`octoAgent Memory MCP (OAuth 2.1) listening on http://0.0.0.0:${PORT}`);
    console.error(`  Base URL:    ${BASE_URL}`);
    console.error(`  MCP:         ${BASE_URL}/mcp`);
    console.error(`  Health:      ${BASE_URL}/health`);
    console.error(`  OAuth meta:  ${BASE_URL}/.well-known/oauth-authorization-server`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
