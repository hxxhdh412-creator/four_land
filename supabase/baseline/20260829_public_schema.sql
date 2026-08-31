-- REVIEW-ONLY SNAPSHOT. DO NOT RUN ON PRODUCTION.
-- Source: Supabase REST OpenAPI inspected read-only on 2026-08-29.
-- Unknown from OpenAPI: non-PK indexes, triggers, RLS/policies and FK delete action.

create table public.properties (
  property_id text not null,
  send_id text,
  status text not null default 'raw',
  account_id text,
  group_id text,
  group_name text,
  sender_id text,
  sender_name text,
  phone text,
  property_type text,
  address text,
  district text,
  ward text,
  street text,
  area_text text,
  area_number numeric,
  dimensions text,
  bedrooms integer,
  bathrooms integer,
  structure text,
  price_text text,
  price_number bigint,
  legal text,
  commission text,
  notes text,
  raw_text text,
  normalized_text text,
  image_count integer not null default 0,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data_json jsonb not null,
  constraint properties_pkey primary key (property_id)
);

create table public.property_images (
  property_id text not null,
  position integer not null,
  storage_path text not null,
  public_url text,
  source_url text,
  created_at timestamptz not null default now(),
  constraint property_images_pkey primary key (property_id, position),
  constraint property_images_property_id_fkey
    foreign key (property_id) references public.properties(property_id)
);

-- public.property_inquiries did not exist in production OpenAPI on 2026-08-29.
