create extension if not exists pgcrypto;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  prospect_name text not null default 'Unknown prospect',
  company_name text not null default '',
  stage_reached integer not null check (stage_reached between 1 and 8),
  notes text not null default '',
  prospect_words text not null default '',
  outcome text not null default 'Other'
    check (outcome in ('Meeting booked', 'Follow-up needed', 'Not interested', 'No answer', 'Other')),
  created_at timestamptz not null default now()
);

create index if not exists calls_created_at_idx on public.calls (created_at desc);

-- This starter uses the backend to access the table. Keep the service-role key
-- on the backend only. Before public production use, add authentication and
-- an appropriate Row Level Security policy for your app's access model.
alter table public.calls enable row level security;
