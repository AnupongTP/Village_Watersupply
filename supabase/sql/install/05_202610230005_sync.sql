begin;
alter table integration.bindings add column lease_until timestamptz,add column lease_generation bigint not null default 0,add column last_error_code text,add column verified_tab_id int,add column consecutive_failures int not null default 0;
create table integration.edit_bases(base_ref uuid primary key default gen_random_uuid(),binding_id uuid references integration.bindings,actor_id text not null,
 entitlement_version bigint not null,entity_id text not null,version text,image jsonb not null,expires_at timestamptz not null default(now()+interval '7 days'));
alter table integration.edit_bases enable row level security;
create policy executor_only on integration.edit_bases to vws_executor using(true)with check(true);
grant select,insert,update,delete on integration.edit_bases to vws_executor;
create function api.sheet_prepare(t text,binding_id uuid,entity_ids jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;b integration.bindings;id text;j jsonb;ref uuid;rows jsonb='[]';version text;begin
 c=app.context(t);select * into b from integration.bindings where bindings.binding_id=sheet_prepare.binding_id and enabled;
 if not found or not app.visible(c,b.district)or(c.role<>'ADMIN'and b.entity_type<>'WATER_SYSTEM')then raise exception 'FORBIDDEN';end if;
 if jsonb_array_length(entity_ids)>100 then raise exception 'BATCH_TOO_LARGE';end if;
 for id in select jsonb_array_elements_text(entity_ids)loop
  if b.entity_type='WATER_SYSTEM'then
   select app.system_json(w,c),app.version(to_jsonb(w))into j,version from app.water_systems w join app.villages v using(village_id)where w.system_id=id and app.visible(c,v.district);
  elsif b.entity_type='VILLAGE'then select to_jsonb(v),app.version(to_jsonb(v))into j,version from app.villages v where village_id=id and app.visible(c,v.district);
  elsif b.entity_type='WATER_SOURCE'then select to_jsonb(s),app.version(to_jsonb(s))into j,version from app.village_water_sources s join app.villages v using(village_id)where source_id=id and app.visible(c,v.district);
  else raise exception 'VALIDATION_FAILED';end if;
  if j is null then raise exception 'NOT_FOUND';end if;
  insert into integration.edit_bases(binding_id,actor_id,entitlement_version,entity_id,version,image)values(b.binding_id,c.actor_id,c.entitlement_version,id,version,j)returning base_ref into ref;
  rows=rows||jsonb_build_array(jsonb_build_object('entityId',id,'baseRef',ref,'expectedVersion',version,'row',j));
 end loop;perform app.touch(t);return jsonb_build_object('bindingId',b.binding_id,'entityType',b.entity_type,'columns',b.columns,'rows',rows);end $$;
create function api.sheet_base(t text,ref uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;b integration.edit_bases;begin c=app.context(t);select * into b from integration.edit_bases where base_ref=ref and actor_id=c.actor_id and entitlement_version=c.entitlement_version and expires_at>now();
 if not found then raise exception 'BASE_EXPIRED';end if;return to_jsonb(b);end $$;
create function api.sheet_submit(t text,p jsonb,rhash text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;b integration.bindings;prev integration.edit_batches;base integration.edit_bases;item jsonb;results jsonb='[]';r jsonb;code text;bid uuid;mid uuid;i int=0;begin
 c=app.context(t);bid=(p->>'batchId')::uuid;
 select * into b from integration.bindings where binding_id=(p->>'bindingId')::uuid and enabled;
 if not found or not app.visible(c,b.district)then raise exception 'FORBIDDEN';end if;
 select * into prev from integration.edit_batches where batch_id=bid;
 if found then if prev.actor_id<>c.actor_id or prev.request_hash<>rhash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if jsonb_array_length(p->'items')not between 1 and 100 then raise exception 'BATCH_TOO_LARGE';end if;
 insert into integration.edit_batches(batch_id,binding_id,actor_id,request_hash,items)values(bid,b.binding_id,c.actor_id,rhash,p->'items');
 begin
 for item in select * from jsonb_array_elements(p->'items')loop
   i=i+1;mid=md5(bid::text||':'||i)::uuid;base=null;
  if item->>'operation'='INSERT'then
   if c.role<>'ADMIN'or b.entity_type='WATER_SYSTEM'then raise exception 'RAW_FIRST_REQUIRED';end if;
   r=app.mutate(c,'data.adminMutate',jsonb_build_object('entityType',b.entity_type,'entityId',item->>'entityId','operation','INSERT','patch',item->'patch'),mid,rhash);
  else
   select * into base from integration.edit_bases where base_ref=(item->>'baseRef')::uuid and binding_id=b.binding_id and actor_id=c.actor_id and entitlement_version=c.entitlement_version and expires_at>now();
   if not found or base.entity_id<>item->>'entityId'or base.version<>item->>'expectedVersion'then raise exception 'BASE_EXPIRED';end if;
   if b.entity_type='WATER_SYSTEM'then
    r=app.mutate(c,case when item->>'operation'='DELETE'then 'data.deleteWaterSystem'else 'data.updateWaterSystem'end,
    jsonb_build_object('systemId',base.entity_id,'expectedVersion',base.version,'reason',item->>'reason','intended',item->'intended'),mid,rhash);
   else
    r=app.mutate(c,'data.adminMutate',jsonb_build_object('entityType',b.entity_type,'entityId',base.entity_id,'operation',item->>'operation','expectedVersion',base.version,'patch',item->'patch','reason',item->>'reason'),mid,rhash);
   end if;
  end if;
  results=results||jsonb_build_array(r);
 end loop;r=jsonb_build_object('state','COMMITTED','results',results);
 exception when others then
  code=SQLERRM;results='[]';r=jsonb_build_object('state','CONFLICT','code',case when code in('CONFLICT','BASE_EXPIRED','NOT_FOUND','PROCESSING_NOT_READY','RAW_FIRST_REQUIRED','FORBIDDEN')then code else 'VALIDATION_FAILED'end);
 end;
 if r->>'state'='CONFLICT'then
  insert into integration.conflicts(batch_id,entity_id,reason,base_image,draft_image)values(bid,item->>'entityId',r->>'code',to_jsonb(base),p->'items');
 end if;
 update integration.edit_batches set state=r->>'state',result=r where batch_id=bid;perform app.touch(t);return r;end $$;
create function api.sheet_status(t text,binding_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;b integration.bindings;r jsonb;begin c=app.context(t);select * into b from integration.bindings where bindings.binding_id=sheet_status.binding_id;
 if not found or not app.visible(c,b.district)then raise exception 'FORBIDDEN';end if;
 r=jsonb_build_object('bindingId',b.binding_id,'enabled',b.enabled,'verifiedRevision',b.verified_revision,'currentRevision',(select revision from app.authority),'needsReconciliation',b.requires_reconciliation,
 'lastError',b.last_error_code,'verifiedTabId',b.verified_tab_id,'batches',coalesce((select jsonb_agg(jsonb_build_object('batchId',batch_id,'state',state,'result',result,'createdAt',created_at))from integration.edit_batches e where e.binding_id=b.binding_id and(c.role='ADMIN'or e.actor_id=c.actor_id)),'[]'),
 'conflicts',coalesce((select jsonb_agg(jsonb_build_object('conflictId',f.conflict_id,'entityId',f.entity_id,'reason',f.reason,'state',f.state,'batchId',f.batch_id))from integration.conflicts f join integration.edit_batches e using(batch_id)where e.binding_id=b.binding_id and(c.role='ADMIN'or e.actor_id=c.actor_id)),'[]'));
 perform app.touch(t);return r;end $$;
create function api.resolve_conflict(t text,id uuid,resolution jsonb)returns void language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;begin c=app.context(t);
 if resolution->>'decision'not in('DISCARD','REBASED')then raise exception 'VALIDATION_FAILED';end if;
 if resolution->>'decision'='REBASED'and not exists(select 1 from integration.edit_batches where batch_id=(resolution->>'newBatchId')::uuid and state='COMMITTED'and actor_id=c.actor_id)then raise exception 'CONFLICT';end if;
 update integration.conflicts f set state=resolution->>'decision',resolved_mutation=nullif(resolution->>'newBatchId','')::uuid from integration.edit_batches b
 where f.conflict_id=id and b.batch_id=f.batch_id and(c.role='ADMIN'or b.actor_id=c.actor_id);if not found then raise exception 'FORBIDDEN';end if;end $$;

create function api.worker_claim()returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare b integration.bindings;r jsonb;c app.accounts;begin
 -- A binding claims a full generation. Canonical history/outbox is not discarded when events coalesce.
 select * into b from integration.bindings where enabled and(lease_until is null or lease_until<now())
 and(requires_reconciliation or verified_revision<(select revision from app.authority))order by verified_revision for update skip locked limit 1;
 if not found then return null;end if;
 update integration.bindings set lease_until=now()+interval '5 minutes',lease_generation=lease_generation+1 where binding_id=b.binding_id returning * into b;
 insert into integration.deliveries(event_id,binding_id)select event_id,b.binding_id from integration.outbox where revision>b.verified_revision on conflict do nothing;
 update integration.deliveries set state='LEASED',lease_until=b.lease_until,lease_generation=b.lease_generation where binding_id=b.binding_id and state<>'VERIFIED';
 c.role=case when b.district is null then 'ADMIN'else 'TECHNICIAN'end;c.district=b.district;
 r=app.dashboard(c);
 return jsonb_build_object('binding',to_jsonb(b),'snapshot',r,'leaseGeneration',b.lease_generation);end $$;
create function api.worker_ack(p jsonb)returns bool language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare b integration.bindings;row jsonb;begin
 select * into b from integration.bindings where binding_id=(p->>'bindingId')::uuid for update;
 if not found or not b.enabled or b.lease_generation<>(p->>'leaseGeneration')::bigint or b.lease_until<now()then return false;end if;
 if (p->>'revision')::bigint<b.verified_revision or(p->>'epoch')::uuid<>(select epoch from app.authority)then return false;end if;
 update integration.bindings set verified_revision=(p->>'revision')::bigint,verified_tab_id=(p->>'tabId')::int,requires_reconciliation=false,lease_until=null,last_error_code=null,consecutive_failures=0 where binding_id=b.binding_id;
 update integration.deliveries d set state='VERIFIED',verified_at=now()from integration.outbox o where d.event_id=o.event_id and d.binding_id=b.binding_id and o.revision<=(p->>'revision')::bigint;
 for row in select * from jsonb_array_elements(p->'rows')loop
  insert into integration.sheet_rows(binding_id,entity_id,base_image,version,hash)values(b.binding_id,row->>'id',row->'image',row->>'version',row->>'hash')
  on conflict(binding_id,entity_id)do update set base_image=excluded.base_image,version=excluded.version,hash=excluded.hash;
 end loop;
 delete from integration.sheet_rows where binding_id=b.binding_id and entity_id not in(select x->>'id'from jsonb_array_elements(p->'rows')x);
 return true;end $$;
create function api.worker_fail(p jsonb)returns void language plpgsql security definer set search_path=pg_catalog,integration as $$
declare b integration.bindings;begin
 update integration.bindings set requires_reconciliation=true,last_error_code=p->>'code',consecutive_failures=consecutive_failures+1,
 enabled=case when p->>'code'in('GOOGLE_HTTP_401','GOOGLE_HTTP_403','GOOGLE_AUTH_FAILED','GOOGLE_WORKBOOK_NOT_ALLOWED','SYNC_CONFIGURATION')then false else enabled end,
 lease_until=now()+make_interval(secs=>least(3600,5*power(2,least(consecutive_failures,10)))+random()*5)
 where binding_id=(p->>'bindingId')::uuid and lease_generation=(p->>'leaseGeneration')::bigint returning * into b;
 if found then update integration.deliveries set state='RETRY',attempts=attempts+1,next_attempt_at=b.lease_until,last_error_code=p->>'code'where binding_id=b.binding_id and state<>'VERIFIED';end if;end $$;
create function api.reconcile_due(p jsonb)returns uuid language plpgsql security definer set search_path=pg_catalog,integration as $$
declare id uuid;begin
 insert into integration.reconciliation_runs(binding_id,state,report,completed_at)values((p->>'bindingId')::uuid,p->>'state',p->'report',now())returning run_id into id;
 update integration.bindings set requires_reconciliation=p->>'state'<>'MATCH'where binding_id=(p->>'bindingId')::uuid;return id;end $$;
create function api.reconcile_bindings()returns jsonb language sql security definer set search_path=pg_catalog,integration as $$
 select coalesce(jsonb_agg(to_jsonb(b)),'[]')from integration.bindings b where enabled $$;
create function api.auth_cleanup_jobs()returns jsonb language sql security definer set search_path=pg_catalog,integration as $$
 select coalesce(jsonb_agg(jsonb_build_object('jobId',job_id,'authId',target_auth_id)),'[]')from integration.auth_jobs where action='AUTH_DELETE'and state<>'COMMITTED' $$;
create function api.auth_cleanup_done(job_id uuid)returns void language sql security definer set search_path=pg_catalog,integration as $$
 update integration.auth_jobs set state='COMMITTED',credential_cipher=null where auth_jobs.job_id=auth_cleanup_done.job_id and action='AUTH_DELETE' $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'loop
 execute format('alter function %s owner to vws_executor',f.sig);execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;end $$;

commit;
