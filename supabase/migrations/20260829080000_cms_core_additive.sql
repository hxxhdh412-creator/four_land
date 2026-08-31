-- CMS core, additive migration.
-- Review and rehearse on staging before applying to production.
-- Public API continues to use legacy properties.status until a later release.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check
    check (role in ('super_admin', 'manager', 'editor', 'sales', 'viewer'))
);

alter table public.properties
  add column if not exists content_status text,
  add column if not exists availability_status text,
  add column if not exists quality_status text,
  add column if not exists is_featured boolean,
  add column if not exists assigned_to uuid,
  add column if not exists published_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists cms_override_fields text[],
  add column if not exists version bigint;

update public.properties
set
  content_status = coalesce(
    content_status,
    case when status = 'archived' then 'archived' else 'published' end
  ),
  availability_status = coalesce(
    availability_status,
    case when status = 'rented' then 'rented' else 'available' end
  ),
  quality_status = coalesce(
    quality_status,
    case
      when status in ('raw', 'partial', 'complete') then status
      when status in ('ready', 'featured', 'rented') then 'complete'
      else 'needs_review'
    end
  ),
  is_featured = coalesce(
    is_featured,
    status = 'featured' or lower(coalesce(data_json ->> 'is_featured', '')) in ('true', '1', 'yes')
  ),
  published_at = coalesce(
    published_at,
    case when status <> 'archived' then updated_at end
  ),
  cms_override_fields = coalesce(cms_override_fields, array[]::text[]),
  version = coalesce(version, 1);

update public.properties
set cms_override_fields = array(
  select distinct value
  from jsonb_array_elements_text(data_json -> 'cms_override_fields') as value
)
where jsonb_typeof(data_json -> 'cms_override_fields') = 'array'
  and cardinality(cms_override_fields) = 0;

alter table public.properties
  alter column content_status set default 'draft',
  alter column content_status set not null,
  alter column availability_status set default 'available',
  alter column availability_status set not null,
  alter column quality_status set default 'raw',
  alter column quality_status set not null,
  alter column is_featured set default false,
  alter column is_featured set not null,
  alter column cms_override_fields set default array[]::text[],
  alter column cms_override_fields set not null,
  alter column version set default 1,
  alter column version set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_content_status_check') then
    alter table public.properties add constraint properties_content_status_check
      check (content_status in ('draft', 'pending_review', 'published', 'rejected', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_availability_status_check') then
    alter table public.properties add constraint properties_availability_status_check
      check (availability_status in ('available', 'reserved', 'rented', 'sold', 'unavailable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_quality_status_check') then
    alter table public.properties add constraint properties_quality_status_check
      check (quality_status in ('raw', 'partial', 'complete', 'needs_review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_assigned_to_fkey') then
    alter table public.properties add constraint properties_assigned_to_fkey
      foreign key (assigned_to) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_version_positive_check') then
    alter table public.properties add constraint properties_version_positive_check check (version > 0);
  end if;
end $$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[] not null default array[]::text[],
  request_id text,
  source text not null default 'cms',
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists properties_content_received_idx
  on public.properties (content_status, received_at desc);
create index if not exists properties_availability_received_idx
  on public.properties (availability_status, received_at desc);
create index if not exists properties_assigned_content_idx
  on public.properties (assigned_to, content_status);
create index if not exists properties_quality_updated_idx
  on public.properties (quality_status, updated_at desc);
create index if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);
create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

revoke update, delete on table public.audit_logs from anon, authenticated;

commit;
