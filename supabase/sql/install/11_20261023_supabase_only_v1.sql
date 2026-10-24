-- Supabase-only runtime. Apply LAST after migrations 001-010, only after review.
-- No data/history is dropped. No triggers or Cloud resources are installed.
begin;
update integration.bindings set enabled=false;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='api' and p.proname in
 ('sheet_prepare','sheet_base','sheet_submit','sheet_status','resolve_conflict','conflict_detail',
  'worker_claim','worker_ack','worker_fail','reconcile_due','reconcile_bindings',
  'direct_observe','direct_capture','direct_status','direct_register')loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
create or replace function api.intake(p jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,ingest as $$
declare s ingest.submissions;c app.accounts;begin
 perform 1 from app.authority for update;
 c=app.context(p->>'authTokenHash');
 if not app.visible(c,p->'data'->>'district')then raise exception 'FORBIDDEN';end if;
 if coalesce(p->>'submissionId','') !~ '^PLB-[A-Za-z0-9_-]+$'or length(coalesce(p->>'hash',''))<>64 then raise exception 'VALIDATION_FAILED';end if;
 select * into s from ingest.submissions where submission_id=p->>'submissionId'for update;
 if found then if s.payload_hash<>p->>'hash'then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 else insert into ingest.submissions(submission_id,payload_hash,raw_payload,raw_cells)values(p->>'submissionId',p->>'hash',p->'data',p->'raw')returning * into s;end if;
 return jsonb_build_object('receiptId',s.receipt_id,'rawSaved',true,'processingStatus',s.status,'processedSystemId',s.processed_system_id,'raw',s.raw_cells);end $$;

create or replace function api.processor_commit(p jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,ingest,integration as $$
declare s ingest.submissions;c app.accounts;item jsonb;obj jsonb;b jsonb;a jsonb;v app.villages;w app.water_systems;mid uuid;r jsonb;ordinal int=0;id text;begin
 perform 1 from app.authority for update;
 select * into s from ingest.submissions where receipt_id=(p->>'receiptId')::uuid for update;
 if not found then raise exception 'NOT_FOUND';end if;
 c=app.context(p->>'authTokenHash');
 if not app.visible(c,s.raw_payload->>'district')then raise exception 'FORBIDDEN';end if;
 if s.status='PROCESSED'then return jsonb_build_object('rawSaved',true,'processingStatus','PROCESSED','systemId',s.processed_system_id);end if;
 if (select revision from app.authority)<>(p->>'baseRevision')::bigint then raise exception 'CONFLICT';end if;
 if exists(select 1 from app.entity_ledger where origin_submission_id=s.submission_id and deleted_at is not null)then raise exception 'TOMBSTONED';end if;
 if true then
  c=app.context(p->>'authTokenHash');
  if not app.visible(c,s.raw_payload->>'district')then raise exception 'FORBIDDEN';end if;
  if c.role='TECHNICIAN'and(exists(select 1 from jsonb_array_elements(p->'villages')x where not app.visible(c,x->>'district'))
   or not exists(select 1 from app.villages where village_id=p->'system'->>'village_id'and district=c.district)
      and not exists(select 1 from jsonb_array_elements(p->'villages')x where x->>'village_id'=p->'system'->>'village_id'and x->>'district'=c.district))then raise exception 'FORBIDDEN';end if;
 end if;
 c.actor_id='SYSTEM-PROCESSOR';c.username='processor';c.role='ADMIN';
 -- Each member is a source-derived complete row, not an arbitrary public JSON patch.
 for item in select * from jsonb_array_elements(p->'villages')loop
  id=item->>'village_id';select to_jsonb(t)into b from app.villages t where village_id=id for update;
  if exists(select 1 from app.entity_ledger where entity_type='VILLAGE'and entity_id=id and deleted_at is not null)then raise exception 'TOMBSTONED';end if;
  obj=item;
  select * into v from jsonb_populate_record(null::app.villages,obj);
  v.record_version=coalesce((b->>'record_version')::bigint,0)+1;
  perform app.upsert_row('villages','village_id',to_jsonb(v));
  insert into app.entity_ledger(entity_type,entity_id,district)values('VILLAGE',id,v.district)on conflict(entity_type,entity_id)do nothing;
  mid=md5(s.receipt_id::text||':v:'||id)::uuid;
  r=app.audit_commit(c,mid,s.payload_hash,'PROCESSOR_VILLAGE','VILLAGE',id,v.district,b,to_jsonb(v),'',jsonb_build_object('villageId',id));
 end loop;
 obj=p->'system';id=obj->>'system_id';
 if exists(select 1 from app.entity_ledger where entity_type='WATER_SYSTEM'and entity_id=id)or exists(select 1 from app.water_systems where system_id=id)then raise exception 'CONFLICT';end if;
 select * into w from jsonb_populate_record(null::app.water_systems,obj);w.record_version=1;
 insert into app.water_systems select w.*;
 insert into app.entity_ledger(entity_type,entity_id,origin_submission_id,district)select 'WATER_SYSTEM',id,s.submission_id,district from app.villages where village_id=w.village_id;
 update ingest.submissions set status='PROCESSED',processed_village_id=w.village_id,processed_system_id=id,processed_at=now(),processor_version='PLUMBING_PROCESSOR_V2_DB1',
  raw_cells=raw_cells||(p->'processingFields'),attempts=attempts+1,error_code=null where receipt_id=s.receipt_id;
 mid=md5(s.receipt_id::text||':s')::uuid;
 r=app.audit_commit(c,mid,s.payload_hash,'PROCESSOR_SYSTEM','WATER_SYSTEM',id,(select district from app.villages where village_id=w.village_id),null,to_jsonb(w),'',
 jsonb_build_object('rawSaved',true,'processingStatus','PROCESSED','systemId',id,'villageId',w.village_id,'receiptId',s.receipt_id));return r;
end $$;

-- End installation-only ownership privileges; retain ordinary USAGE.
revoke create on schema app,api from vws_executor;
commit;
