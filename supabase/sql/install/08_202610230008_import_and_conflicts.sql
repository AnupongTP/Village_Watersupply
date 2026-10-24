begin;
create table integration.import_runs(manifest_hash text primary key,counts jsonb not null,completed_at timestamptz not null default now());
alter table integration.import_runs enable row level security;create policy executor_only on integration.import_runs to vws_executor using(true)with check(true);grant select,insert on integration.import_runs to vws_executor;
create function api.initial_import(p jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,ingest,integration,history as $$
declare a app.authority;r jsonb;row jsonb;i int=0;d text;begin
 select * into a from app.authority for update;
 if exists(select 1 from integration.import_runs where manifest_hash=p->>'manifestHash')then return jsonb_build_object('state','ALREADY_IMPORTED');end if;
 if a.revision<>0 or exists(select 1 from app.villages)or exists(select 1 from ingest.submissions)then raise exception 'INITIAL_IMPORT_ONLY';end if;
 if length(p->>'manifestHash')<>64 then raise exception 'INVALID_MANIFEST';end if;
 insert into app.districts select distinct x->>'district'from jsonb_array_elements(p->'tables'->'villages')x where nullif(x->>'district','')is not null;
 insert into app.villages select r.* from jsonb_array_elements(p->'tables'->'villages')x cross join lateral jsonb_populate_record(null::app.villages,x||'{"record_version":1}')r;
 insert into app.water_systems select r.* from jsonb_array_elements(p->'tables'->'water_systems')x cross join lateral jsonb_populate_record(null::app.water_systems,x||'{"record_version":1}')r;
 insert into app.village_water_sources select r.* from jsonb_array_elements(p->'tables'->'village_water_sources')x cross join lateral jsonb_populate_record(null::app.village_water_sources,x||'{"record_version":1}')r;
 insert into app.entity_ledger(entity_type,entity_id,district)select 'WATER_SYSTEM',system_id,district from app.water_systems join app.villages using(village_id);
 insert into app.entity_ledger(entity_type,entity_id,district)select 'VILLAGE',village_id,district from app.villages;
 insert into app.entity_ledger(entity_type,entity_id,district)select 'WATER_SOURCE',source_id,district from app.village_water_sources join app.villages using(village_id);
 for row in select * from jsonb_array_elements(p->'tables'->'mainplumbing')loop i=i+1;
 insert into ingest.submissions(submission_id,payload_hash,raw_payload,raw_cells,status,import_identity,processed_village_id,processed_system_id,processor_version)
 values(nullif(row->>'submission_id',''),coalesce(nullif(row->>'payload_fingerprint',''),app.version(row)),coalesce(nullif(row->>'raw_payload_json','')::jsonb,'{}'),row,
 case when row->>'processing_status'='PROCESSED'then 'PROCESSED'else 'QUARANTINED'end,(p->>'manifestHash')||':raw:'||i,
 nullif(row->>'processed_village_id',''),nullif(row->>'processed_system_id',''),row->>'processor_version');end loop;
 i=0;for row in select * from jsonb_array_elements(p->'tables'->'audit_log')loop i=i+1;insert into history.legacy_audit values((p->>'manifestHash')||':audit:'||i,row,row->>'audit_status');
 if row->>'action'='SYSTEM_DELETE'and row->>'audit_status'='COMMITTED'and row->>'entity_type'='WATER_SYSTEM'then
 if exists(select 1 from app.water_systems where system_id=row->>'entity_id')then raise exception 'DELETE_CONTRACT_CONFLICT';end if;
 select district into d from app.villages where village_id=(nullif(row->>'before_json','')::jsonb)->>'village_id';if d is null then raise exception 'DELETION_SCOPE_UNRESOLVED';end if;
 insert into app.entity_ledger(entity_type,entity_id,district,deleted_at,deletion_mutation)values('WATER_SYSTEM',row->>'entity_id',d,(row->>'timestamp')::timestamptz,md5(row->>'audit_id')::uuid)on conflict(entity_type,entity_id)do nothing;
 end if;end loop;
 i=0;for row in select * from jsonb_array_elements(p->'tables'->'record_control')loop i=i+1;insert into history.legacy_record_control values((p->>'manifestHash')||':control:'||i,row,'UNVERIFIED');end loop;
 update app.authority set revision=1;
 insert into integration.outbox(epoch,revision,mutation_id,entity_type,entity_id,operation)values(a.epoch,1,gen_random_uuid(),'IMPORT',p->>'manifestHash','REBUILD');
 insert into integration.import_runs values(p->>'manifestHash',p->'counts',now());return jsonb_build_object('state','IMPORTED','sourceRevision',1);end $$;
create function api.bootstrap_admin(p jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare a app.accounts;begin perform 1 from app.authority for update;
 if p->>'confirmation'<>'FIRST_ADMIN_REVIEWED'or exists(select 1 from app.accounts where role='ADMIN')then raise exception 'ADMIN_BOOTSTRAP_DENIED';end if;
 if not history.vws_auth_identity_matches((p->>'authId')::uuid,p->>'identity')then raise exception 'AUTH_INVALID';end if;
 insert into app.identities(actor_id,auth_user_id)values(p->>'actorId',(p->>'authId')::uuid);
 insert into app.accounts(actor_id,username,display_name,role,login_identity)values(p->>'actorId',p->>'username',p->>'displayName','ADMIN',p->>'identity')returning * into a;
 return app.account_json(a);end $$;
create function api.conflict_detail(t text,id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;f integration.conflicts;b integration.edit_batches;binding integration.bindings;current jsonb;begin c=app.context(t);select * into f from integration.conflicts where conflict_id=id;
 if not found then raise exception 'NOT_FOUND';end if;select * into b from integration.edit_batches where batch_id=f.batch_id;
 select * into binding from integration.bindings where binding_id=b.binding_id;
 if(c.role<>'ADMIN'and b.actor_id<>c.actor_id)or not app.visible(c,binding.district)then raise exception 'FORBIDDEN';end if;
 if binding.entity_type='WATER_SYSTEM'then select app.system_json(s,c)into current from app.water_systems s join app.villages v using(village_id)where s.system_id=f.entity_id and app.visible(c,v.district);
 elsif binding.entity_type='VILLAGE'then select to_jsonb(v)into current from app.villages v where village_id=f.entity_id and app.visible(c,v.district);
 elsif binding.entity_type='WATER_SOURCE'then select to_jsonb(s)into current from app.village_water_sources s join app.villages v using(village_id)where source_id=f.entity_id and app.visible(c,v.district);end if;
 return jsonb_build_object('conflictId',id,'reason',f.reason,'base',f.base_image->'image','draft',f.draft_image,'current',current);end $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'loop
 execute format('alter function %s owner to vws_executor',f.sig);execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;end $$;
commit;
