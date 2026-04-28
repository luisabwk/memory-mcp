-- =============================================================================
-- Migration: OAuth 2.1 persistent state for octoagent-memory
-- =============================================================================
-- Run once against the Supabase project that owns SUPABASE_URL.
-- Service role key bypasses RLS; the tables below have RLS disabled
-- because only the server-side service role accesses them directly.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- oauth_clients
-- Stores registered OAuth clients (DCR — Dynamic Client Registration).
-- No expiry: clients persist until explicitly deleted.
-- ---------------------------------------------------------------------------
create table if not exists oauth_clients (
  client_id   text        primary key,
  client_data jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists oauth_clients_created_at_idx
  on oauth_clients (created_at);

-- ---------------------------------------------------------------------------
-- oauth_auth_codes
-- Short-lived PKCE authorization codes (TTL = 5 minutes).
-- ---------------------------------------------------------------------------
create table if not exists oauth_auth_codes (
  code           text        primary key,
  client_id      text        not null references oauth_clients (client_id) on delete cascade,
  code_challenge text        not null,
  redirect_uri   text        not null,
  scopes         text[]      not null default '{}',
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists oauth_auth_codes_client_id_idx
  on oauth_auth_codes (client_id);

create index if not exists oauth_auth_codes_expires_at_idx
  on oauth_auth_codes (expires_at);

-- ---------------------------------------------------------------------------
-- oauth_access_tokens
-- Bearer tokens (TTL = 1 hour).
-- ---------------------------------------------------------------------------
create table if not exists oauth_access_tokens (
  token      text        primary key,
  client_id  text        not null references oauth_clients (client_id) on delete cascade,
  scopes     text[]      not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_access_tokens_client_id_idx
  on oauth_access_tokens (client_id);

create index if not exists oauth_access_tokens_expires_at_idx
  on oauth_access_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- oauth_refresh_tokens
-- Long-lived rotation tokens (expires_at = NULL means no expiry).
-- ---------------------------------------------------------------------------
create table if not exists oauth_refresh_tokens (
  token      text        primary key,
  client_id  text        not null references oauth_clients (client_id) on delete cascade,
  scopes     text[]      not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_refresh_tokens_client_id_idx
  on oauth_refresh_tokens (client_id);

-- ---------------------------------------------------------------------------
-- Cleanup job: purge expired auth codes and access tokens automatically.
-- Requires pg_cron extension (enable via Supabase Dashboard → Extensions).
-- If pg_cron is not enabled, expired rows are cleaned up lazily on verify.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'purge-expired-oauth-tokens',
      '*/15 * * * *',
      $cron$
        delete from oauth_auth_codes    where expires_at < now();
        delete from oauth_access_tokens where expires_at < now();
      $cron$
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: disabled — service role key is used exclusively.
-- ---------------------------------------------------------------------------
alter table oauth_clients        disable row level security;
alter table oauth_auth_codes     disable row level security;
alter table oauth_access_tokens  disable row level security;
alter table oauth_refresh_tokens disable row level security;
