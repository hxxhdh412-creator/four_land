-- Staging rollback only. Existing property and audit data are preserved.
begin;
drop function if exists public.cms_transition_property(text,bigint,text,uuid,text);
drop function if exists public.cms_save_property_draft(text,bigint,jsonb,uuid,text);
commit;
