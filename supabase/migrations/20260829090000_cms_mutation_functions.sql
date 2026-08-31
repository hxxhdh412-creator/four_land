-- Atomic CMS mutations. Apply only after the CMS core migration on staging.
begin;

create or replace function public.cms_save_property_draft(p_property_id text, p_expected_version bigint, p_changes jsonb, p_actor_id uuid, p_request_id text default null)
returns setof public.properties language plpgsql security definer set search_path=public as $$
declare before_row public.properties; after_row public.properties; changed text[];
begin
  select * into before_row from public.properties where property_id=p_property_id for update;
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  if before_row.version<>p_expected_version then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  changed:=array(select key from jsonb_object_keys(coalesce(p_changes,'{}'::jsonb)) key where key=any(array['address','district','ward','street','property_type','price_text','area_text','dimensions','bedrooms','bathrooms','structure','legal','commission','notes','phone']));
  if cardinality(changed)=0 then raise exception using errcode='22023',message='NO_EDITABLE_FIELDS'; end if;
  update public.properties set
    address=case when p_changes?'address' then nullif(p_changes->>'address','') else address end,
    district=case when p_changes?'district' then nullif(p_changes->>'district','') else district end,
    ward=case when p_changes?'ward' then nullif(p_changes->>'ward','') else ward end,
    street=case when p_changes?'street' then nullif(p_changes->>'street','') else street end,
    property_type=case when p_changes?'property_type' then nullif(p_changes->>'property_type','') else property_type end,
    price_text=case when p_changes?'price_text' then nullif(p_changes->>'price_text','') else price_text end,
    area_text=case when p_changes?'area_text' then nullif(p_changes->>'area_text','') else area_text end,
    dimensions=case when p_changes?'dimensions' then nullif(p_changes->>'dimensions','') else dimensions end,
    bedrooms=case when p_changes?'bedrooms' then nullif(p_changes->>'bedrooms','')::integer else bedrooms end,
    bathrooms=case when p_changes?'bathrooms' then nullif(p_changes->>'bathrooms','')::integer else bathrooms end,
    structure=case when p_changes?'structure' then nullif(p_changes->>'structure','') else structure end,
    legal=case when p_changes?'legal' then nullif(p_changes->>'legal','') else legal end,
    commission=case when p_changes?'commission' then nullif(p_changes->>'commission','') else commission end,
    notes=case when p_changes?'notes' then nullif(p_changes->>'notes','') else notes end,
    phone=case when p_changes?'phone' then nullif(p_changes->>'phone','') else phone end,
    cms_override_fields=array(select distinct unnest(coalesce(cms_override_fields,'{}'::text[])||changed)),
    content_status=case when content_status='published' then 'draft' else content_status end,
    version=version+1,updated_at=now()
  where property_id=p_property_id returning * into after_row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,changed_fields,request_id)
  values(p_actor_id,'property.draft_saved','property',p_property_id,to_jsonb(before_row),to_jsonb(after_row),changed,p_request_id);
  return next after_row;
end $$;

create or replace function public.cms_transition_property(p_property_id text,p_expected_version bigint,p_command text,p_actor_id uuid,p_request_id text default null)
returns setof public.properties language plpgsql security definer set search_path=public as $$
declare before_row public.properties; after_row public.properties; next_status text;
begin
  select * into before_row from public.properties where property_id=p_property_id for update;
  if not found then raise exception using errcode='P0002',message='PROPERTY_NOT_FOUND'; end if;
  if before_row.version<>p_expected_version then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  next_status:=case p_command when 'submit_review' then 'pending_review' when 'publish' then 'published' when 'reject' then 'rejected' when 'archive' then 'archived' when 'restore' then 'draft' end;
  if next_status is null then raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  if not ((p_command='submit_review' and before_row.content_status in ('draft','rejected')) or (p_command in ('publish','reject') and before_row.content_status='pending_review') or (p_command='archive' and before_row.content_status in ('draft','pending_review','published','rejected')) or (p_command='restore' and before_row.content_status='archived')) then raise exception using errcode='23514',message='INVALID_TRANSITION'; end if;
  update public.properties set content_status=next_status,published_at=case when next_status='published' then now() else published_at end,status=case when next_status='archived' then 'archived' when status='archived' then 'partial' else status end,version=version+1,updated_at=now() where property_id=p_property_id returning * into after_row;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,changed_fields,request_id) values(p_actor_id,'property.'||p_command,'property',p_property_id,to_jsonb(before_row),to_jsonb(after_row),array['content_status'],p_request_id);
  return next after_row;
end $$;

revoke all on function public.cms_save_property_draft(text,bigint,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.cms_transition_property(text,bigint,text,uuid,text) from public,anon,authenticated;
grant execute on function public.cms_save_property_draft(text,bigint,jsonb,uuid,text) to service_role;
grant execute on function public.cms_transition_property(text,bigint,text,uuid,text) to service_role;
commit;
