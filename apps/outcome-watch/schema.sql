create table organizations (id uuid primary key default gen_random_uuid(), name text not null);
create table clients (id uuid primary key default gen_random_uuid(), organization_id uuid references organizations not null, name text not null);
create table workflows (
  id uuid primary key default gen_random_uuid(), client_id uuid references clients not null,
  name text not null, key_hash text not null unique, sla_minutes int not null check (sla_minutes between 1 and 10080),
  cadence_minutes int, required_fields text[] not null default '{}', public_token_hash text
);
create table events (
  id bigint generated always as identity primary key, workflow_id uuid references workflows not null,
  correlation_id text not null, stage text not null check (stage in ('source','destination')),
  occurred_at timestamptz not null, fields jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(workflow_id, correlation_id, stage)
);
create table incidents (
  id uuid primary key default gen_random_uuid(), workflow_id uuid references workflows not null,
  kind text not null, correlation_id text, status text not null default 'open', opened_at timestamptz not null default now(),
  resolved_at timestamptz, unique(workflow_id, kind, correlation_id, status)
);
create index events_lookup on events(workflow_id, correlation_id, stage);
