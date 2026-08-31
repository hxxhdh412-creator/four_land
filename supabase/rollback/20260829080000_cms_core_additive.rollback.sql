-- EMERGENCY REFERENCE ONLY. DESTRUCTIVE. DO NOT RUN WITHOUT BACKUP AND APPROVAL.
-- Prefer a forward-fix after production has started writing CMS data.

begin;

drop table if exists public.audit_logs;

alter table public.properties
  drop constraint if exists properties_version_positive_check,
  drop constraint if exists properties_assigned_to_fkey,
  drop constraint if exists properties_quality_status_check,
  drop constraint if exists properties_availability_status_check,
  drop constraint if exists properties_content_status_check,
  drop column if exists version,
  drop column if exists cms_override_fields,
  drop column if exists source_updated_at,
  drop column if exists last_synced_at,
  drop column if exists verified_at,
  drop column if exists published_at,
  drop column if exists assigned_to,
  drop column if exists is_featured,
  drop column if exists quality_status,
  drop column if exists availability_status,
  drop column if exists content_status;

drop table if exists public.profiles;

commit;
