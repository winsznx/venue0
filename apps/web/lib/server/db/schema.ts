/**
 * Product database schema (D-019). Offchain state only: users, onboarding, targets, circles, rounds, intents,
 * approvals, residual decisions and activity. Balances, prices and settlements are always re-read from Robinhood Chain.
 * Each entry runs once, in order, and is recorded in schema_migrations.
 */
export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  {
    id: "001_product",
    sql: `
create table users (
  address text primary key,
  dynamic_user_id text,
  email text,
  wallet_kind text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  onboarded_at timestamptz,
  agent_mode text not null default 'STRUCTURED',
  residual_preference text not null default 'ECONOMIC'
);

create table targets (
  address text primary key references users(address),
  weights jsonb not null,
  source text not null,
  instruction text,
  updated_at timestamptz not null default now()
);

create table circles (
  id text primary key,
  name text not null,
  description text not null default '',
  visibility text not null,
  organizer text not null references users(address),
  asset_uids jsonb not null,
  min_participants integer not null,
  cadence_sec integer,
  duration_sec integer not null,
  residual_behavior text not null,
  privacy_mode text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  circle_id text not null references circles(id),
  address text not null references users(address),
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (circle_id, address)
);

create table invites (
  code_hash text primary key,
  circle_id text not null references circles(id),
  created_by text not null,
  created_at timestamptz not null default now(),
  used_by text,
  used_at timestamptz
);

create table rounds (
  id text primary key,
  circle_id text not null references circles(id),
  sequence integer not null,
  state text not null,
  opens_at bigint not null,
  freezes_at bigint not null,
  settlement_contract text not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  match jsonb,
  plan jsonb,
  settlement_tx text,
  verification jsonb,
  created_at timestamptz not null default now(),
  unique (circle_id, sequence)
);

create table round_history (
  id bigserial primary key,
  round_id text not null references rounds(id),
  at bigint not null,
  from_state text not null,
  to_state text not null,
  reason text
);

create table intents (
  round_id text not null references rounds(id),
  owner text not null references users(address),
  intent jsonb not null,
  signature text not null,
  intent_hash text not null,
  submitted_at timestamptz not null default now(),
  primary key (round_id, owner)
);

create table approvals (
  round_id text not null references rounds(id),
  participant text not null,
  nonce text not null,
  signature text not null,
  approved_at timestamptz not null default now(),
  primary key (round_id, participant)
);

create table residual_decisions (
  round_id text not null references rounds(id),
  owner text not null,
  asset_uid text not null,
  side text not null,
  amount_raw text not null,
  engine_decision text not null,
  user_choice text not null,
  detail jsonb not null,
  decided_at timestamptz not null default now(),
  consumed_round_id text,
  primary key (round_id, owner, asset_uid)
);

create table activity (
  id bigserial primary key,
  address text not null,
  kind text not null,
  round_id text,
  circle_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index activity_by_address on activity(address, created_at desc);
create index rounds_by_circle on rounds(circle_id, sequence desc);
`,
  },
  {
    id: "002_residual_quotes",
    sql: `
create table residual_quotes (
  round_id text not null references rounds(id),
  owner text not null,
  quote jsonb not null,
  created_at timestamptz not null default now(),
  primary key (round_id, owner)
);
`,
  },
  {
    // Hosted Postgres (Supabase) exposes the public schema through a REST API. Row-level security with no policies
    // denies those API roles every row; the app connects as the owning role, which RLS does not restrict.
    id: "003_lock_public_api",
    sql: `
alter table users enable row level security;
alter table targets enable row level security;
alter table circles enable row level security;
alter table memberships enable row level security;
alter table invites enable row level security;
alter table rounds enable row level security;
alter table round_history enable row level security;
alter table intents enable row level security;
alter table approvals enable row level security;
alter table residual_decisions enable row level security;
alter table activity enable row level security;
alter table residual_quotes enable row level security;
alter table schema_migrations enable row level security;
`,
  },
  {
    // postgres.js JSON-encoded string parameters bound as ::jsonb, so JSON columns held JSON strings instead of
    // objects. Values are unchanged; only their storage type is corrected. Writes now bind as ::text::jsonb.
    id: "004_json_columns_as_objects",
    sql: `
update targets set weights = (weights #>> '{}')::jsonb where jsonb_typeof(weights) = 'string';
update circles set asset_uids = (asset_uids #>> '{}')::jsonb where jsonb_typeof(asset_uids) = 'string';
update rounds set snapshot = (snapshot #>> '{}')::jsonb where jsonb_typeof(snapshot) = 'string';
update rounds set match = (match #>> '{}')::jsonb where jsonb_typeof(match) = 'string';
update rounds set plan = (plan #>> '{}')::jsonb where jsonb_typeof(plan) = 'string';
update rounds set verification = (verification #>> '{}')::jsonb where jsonb_typeof(verification) = 'string';
update intents set intent = (intent #>> '{}')::jsonb where jsonb_typeof(intent) = 'string';
update residual_decisions set detail = (detail #>> '{}')::jsonb where jsonb_typeof(detail) = 'string';
update activity set detail = (detail #>> '{}')::jsonb where jsonb_typeof(detail) = 'string';
update residual_quotes set quote = (quote #>> '{}')::jsonb where jsonb_typeof(quote) = 'string';
`,
  },
];


