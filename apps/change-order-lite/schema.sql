create table projects (id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null, next_co_number int not null default 1);
create table change_orders (
 id uuid primary key default gen_random_uuid(), project_id uuid references projects not null, number int not null,
 revision int not null default 0, title text not null, scope text not null, subtotal_cents bigint not null,
 markup_bps int not null default 0, tax_bps int not null default 0, total_cents bigint not null,
 status text not null default 'draft', token_hash text, token_expires_at timestamptz, frozen_at timestamptz,
 unique(project_id, number, revision)
);
create table line_items (id uuid primary key default gen_random_uuid(), change_order_id uuid references change_orders on delete cascade, description text not null, quantity numeric not null, unit text not null, unit_price_cents bigint not null);
create table evidence (id uuid primary key default gen_random_uuid(), change_order_id uuid references change_orders, storage_path text not null, sha256 text not null);
create table decisions (id uuid primary key default gen_random_uuid(), change_order_id uuid unique references change_orders, decision text check(decision in ('approved','rejected')), signer_name text not null, note text, decided_at timestamptz not null, ip_hash text not null);
