begin;
-- Narrow service-only API. Browser roles cannot call privileged functions directly.
create function app.version(j jsonb) returns text language sql stable set search_path=pg_catalog,public,app as $$
 select encode(extensions.digest((select epoch::text from app.authority)||j::text,'sha256'),'hex') $$;
create function app.account_json(a app.accounts) returns jsonb language sql stable set search_path=pg_catalog,public,app as $$
 select jsonb_build_object('userId',a.actor_id,'username',a.username,'displayName',a.display_name,'role',a.role,'status',a.status,'district',a.district,
 'mustChangePassword',a.must_change_password,'recordVersion',app.version(to_jsonb(a)),'lastLoginAt',a.last_login_at) $$;
create function app.context(t text,allow_password boolean default false) returns app.accounts language plpgsql set search_path=pg_catalog,public,app as $$
declare s app.sessions;a app.accounts;begin
 -- Global authority gate gives deterministic ordering for this initial candidate. Benchmark before partitioning it.
 perform 1 from app.authority for update;
 select * into s from app.sessions where token_hash=t for update;
 if not found then raise exception 'SESSION_INVALID';end if;
 if s.revoked_at is not null then raise exception 'SESSION_REVOKED';end if;
 if s.expires_at<=clock_timestamp() then raise exception 'SESSION_EXPIRED';end if;
 if s.last_activity_at<clock_timestamp()-interval '30 minutes' then raise exception 'SESSION_IDLE_EXPIRED';end if;
 select a0.* into a from app.accounts a0 join app.identities i using(actor_id)
 where a0.actor_id=s.actor_id and history.vws_auth_session_exists(s.auth_session_id,i.auth_user_id) for update of a0;
 if not found then raise exception 'AUTH_ACCOUNT_DELETED';end if;
 if a.status<>'ACTIVE' then raise exception 'AUTH_ACCOUNT_DISABLED';end if;
 if s.auth_epoch<>a.entitlement_version then raise exception 'SESSION_REVOKED';end if;
 if a.must_change_password and not allow_password then raise exception 'AUTH_PASSWORD_CHANGE_REQUIRED';end if;
 if a.role='TECHNICIAN' and coalesce(a.district,'')='' then raise exception 'ACCOUNT_DISTRICT_REQUIRED';end if;
 return a;end $$;
create function app.touch(t text) returns void language sql set search_path=pg_catalog,app as $$
 update app.sessions set last_activity_at=clock_timestamp() where token_hash=t $$;
create function app.visible(c app.accounts,d text) returns bool language sql immutable as $$select c.role='ADMIN' or c.district=d$$;
create function app.guard(id text) returns jsonb language plpgsql stable set search_path=pg_catalog,ingest as $$
declare n int;st text;begin select count(*),min(status) into n,st from ingest.submissions where processed_system_id=id;
 return jsonb_build_object('linked',n>0,'mutable',n=0 or n=1 and st='PROCESSED','rawLinkCount',n,'status',case when n=0 then 'UNLINKED' when n>1 then 'CONFLICT' else st end,
 'reason',case when n=0 then 'NO_RAW_LINK' when n>1 then 'MULTIPLE_RAW_LINKS' when st='PROCESSED' then 'RAW_PROCESSED' else 'RAW_NOT_PROCESSED' end);end $$;
create function app.compat(j jsonb)returns jsonb language sql immutable as $$select jsonb_object_agg(k,case when v='null'::jsonb then '""'::jsonb else v end)from jsonb_each(j)x(k,v)$$;
create function app.village_json(v app.villages)returns jsonb language sql stable set search_path=pg_catalog,app as $$
 select app.compat(to_jsonb(v)-'record_version'-'last_mutation_id')||jsonb_build_object('linkedActiveSystemCount',n,'publicVisible',not(coalesce(v.has_village_waterworks,false)and n=0),
 'publicSuppressionReasons',case when coalesce(v.has_village_waterworks,false)and n=0 then '["WATERWORKS_WITHOUT_LINKED_ACTIVE_SYSTEM"]'::jsonb else '[]'::jsonb end)
 from(select count(*)n from app.water_systems s where s.village_id=v.village_id and(app.guard(s.system_id)->>'mutable')::bool)q $$;
create function app.system_json(s app.water_systems,c app.accounts) returns jsonb language plpgsql stable set search_path=pg_catalog,public,app as $$
declare j jsonb;g jsonb;shared jsonb;begin
 j=app.compat(to_jsonb(s)-'record_version'-'last_mutation_id');g=app.guard(s.system_id);
 if c.role='TECHNICIAN' and nullif(s.shared_villages_json,'') is not null then
  select coalesce(jsonb_agg(x),'[]') into shared from jsonb_array_elements(s.shared_villages_json::jsonb)x where exists
  (select 1 from app.villages v where v.village_id=coalesce(x->>'village_id',x->>'villageIdRef') and v.district=c.district);
  j=j||jsonb_build_object('shared_villages_json',shared::text,'shared_village_name','');
 end if;
 return j||jsonb_build_object('recordVersion',app.version(to_jsonb(s)),'managementMutable',(g->>'mutable')::bool,'processingGuard',g,
 'publicVisible',s.latitude is not null and s.longitude is not null and(g->>'mutable')::bool,
 'publicSuppressionReasons',case when not(g->>'mutable')::bool then '["RAW_NOT_PROCESSED"]'::jsonb when s.latitude is null or s.longitude is null then '["MISSING_COORDINATE"]'::jsonb else '[]'::jsonb end,
 'village',(select app.village_json(v) from app.villages v where v.village_id=s.village_id));end $$;
create function app.dashboard(c app.accounts) returns jsonb language sql stable set search_path=pg_catalog,public,app as $$
 select jsonb_build_object('generatedAt',clock_timestamp(),'sourceRevision',(select revision from app.authority),'epoch',(select epoch from app.authority),
 'villages',coalesce((select jsonb_agg(app.village_json(v) order by v.village_id) from app.villages v where app.visible(c,v.district)),'[]'),
 'waterSystems',coalesce((select jsonb_agg(app.system_json(s,c) order by s.system_id) from app.water_systems s join app.villages v using(village_id) where app.visible(c,v.district)),'[]'),
 'waterSources',coalesce((select jsonb_agg(app.compat(to_jsonb(s)-'record_version'-'last_mutation_id')||jsonb_build_object('publicVisible',(app.village_json(v)->>'publicVisible')::bool,'publicSuppressionReasons',case when(app.village_json(v)->>'publicVisible')::bool then '[]'::jsonb else '["VILLAGE_SUPPRESSED"]'::jsonb end) order by s.source_id) from app.village_water_sources s join app.villages v using(village_id) where app.visible(c,v.district)),'[]')) $$;
create function app.audit_commit(c app.accounts,mid uuid,rhash text,act text,kind text,id text,d text,b jsonb,a jsonb,reason text,result jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public,app,integration,history as $$
declare r bigint;e uuid;outj jsonb;begin
 update app.authority set revision=revision+1 where singleton is true returning revision,epoch into r,e;
 outj=result||jsonb_build_object('sourceRevision',r,'epoch',e);
 insert into history.audit_events(mutation_id,actor_id,username_snapshot,role_snapshot,action,entity_type,entity_id,district,before_json,after_json,changed_fields,reason)
 values(mid,c.actor_id,c.username,c.role,act,kind,id,d,b,a,coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(b,'{}')||coalesce(a,'{}'))k where b->k is distinct from a->k),'[]'),reason);
 insert into integration.outbox(epoch,revision,mutation_id,entity_type,entity_id,operation,district)values(e,r,mid,kind,id,case when a is null then 'DELETE' else 'UPSERT' end,d);
 insert into integration.mutations(mutation_id,actor_id,request_hash,result,revision)values(mid,c.actor_id,rhash,outj,r);
 return outj;end $$;
create function app.upsert_row(tbl text,pk text,obj jsonb)returns void language plpgsql set search_path=pg_catalog,app as $$
declare setters text;begin
 if tbl not in('villages','water_systems','village_water_sources')then raise exception 'INVALID_TABLE';end if;
 select string_agg(format('%I=excluded.%I',column_name,column_name),',')into setters from information_schema.columns where table_schema='app'and table_name=tbl and column_name<>pk;
 execute format('insert into app.%I select * from jsonb_populate_record(null::app.%I,$1) on conflict(%I)do update set %s',tbl,tbl,pk,setters)using obj;end $$;
create function app.mutate(c app.accounts,act text,p jsonb,mid uuid,rhash text) returns jsonb language plpgsql set search_path=pg_catalog,public,app,integration,history,ingest as $$
declare s app.water_systems;v app.villages;b jsonb;a jsonb;prev integration.mutations;d text;id text;kind text;tbl text;pk text;patch jsonb;q text;k text;g jsonb;
begin
 if mid is null or length(coalesce(rhash,''))<>64 then raise exception 'IDEMPOTENCY_REQUIRED';end if;
 select * into prev from integration.mutations where mutation_id=mid;
 if found then if prev.actor_id<>c.actor_id or prev.request_hash<>rhash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if act in('data.updateWaterSystem','data.deleteWaterSystem') then
  id=p->>'systemId';kind='WATER_SYSTEM';
  select * into s from app.water_systems where system_id=id for update;
  if not found then raise exception 'NOT_FOUND';end if;
  select * into v from app.villages where village_id=s.village_id;
  d=v.district;if not app.visible(c,d) then raise exception 'FORBIDDEN';end if;
  if app.version(to_jsonb(s)) is distinct from p->>'expectedVersion' then raise exception 'CONFLICT';end if;
  g=app.guard(id);if not(g->>'mutable')::bool then raise exception 'PROCESSING_NOT_READY';end if;
  b=to_jsonb(s);
  if act='data.deleteWaterSystem' then
   if length(btrim(coalesce(p->>'reason','')))=0 then raise exception 'VALIDATION_FAILED';end if;
   insert into app.entity_ledger(entity_type,entity_id,deleted_at,deletion_mutation,district)values(kind,id,now(),mid,d)
    on conflict(entity_type,entity_id)do update set deleted_at=excluded.deleted_at,deletion_mutation=excluded.deletion_mutation;
   delete from app.water_systems where system_id=id;a=null;
  else
   -- Gateway canonicalizes with the original pure GAS field-group validator. SQL also excludes identity/provenance keys.
   patch=p->'intended';if patch is null or jsonb_typeof(patch)<>'object' then raise exception 'VALIDATION_FAILED';end if;
   if exists(select 1 from jsonb_object_keys(patch)x where x not in(select column_name from information_schema.columns where table_schema='app' and table_name='water_systems')
     or x in('system_id','village_id','source_excel_row','system_no','created_at','record_version','last_mutation_id')) then raise exception 'IMMUTABLE_FIELD';end if;
   a=b||patch||jsonb_build_object('updated_at',clock_timestamp(),'record_version',s.record_version+1,'last_mutation_id',mid);
   select * into s from jsonb_populate_record(null::app.water_systems,a);
   if (s.latitude is null) <> (s.longitude is null) then raise exception 'VALIDATION_FAILED';end if;
   if s.latitude not between -90 and 90 or s.longitude not between -180 and 180 then raise exception 'VALIDATION_FAILED';end if;
   perform app.upsert_row('water_systems','system_id',to_jsonb(s));
   a=to_jsonb(s);
  end if;
  return app.audit_commit(c,mid,rhash,case when a is null then 'SYSTEM_DELETE' else 'SYSTEM_UPDATE' end,kind,id,d,b,a,p->>'reason',
   case when a is null then jsonb_build_object('deleted',true,'systemId',id)else jsonb_build_object('system',app.system_json(s,c))end);
 elsif act='data.adminMutate' then
  if c.role<>'ADMIN' then raise exception 'FORBIDDEN';end if;
  kind=p->>'entityType';id=p->>'entityId';patch=p->'patch';
  if kind='VILLAGE' then tbl='villages';pk='village_id';elsif kind='WATER_SOURCE' then tbl='village_water_sources';pk='source_id';else raise exception 'VALIDATION_FAILED';end if;
  execute format('select to_jsonb(t) from app.%I t where %I=$1 for update',tbl,pk)into b using id;
  if p->>'operation'='INSERT' then
   if b is not null or exists(select 1 from app.entity_ledger where entity_type=kind and entity_id=id)then raise exception 'CONFLICT';end if;
   a=patch||jsonb_build_object(pk,id,'record_version',1,'last_mutation_id',mid);
  else
   if b is null then raise exception 'NOT_FOUND';end if;
   if app.version(b) is distinct from p->>'expectedVersion' then raise exception 'CONFLICT';end if;
   a=b||coalesce(patch,'{}')||jsonb_build_object('record_version',(b->>'record_version')::bigint+1,'last_mutation_id',mid);
  end if;
  if exists(select 1 from jsonb_object_keys(coalesce(patch,'{}'))x where x in(pk,'source_excel_row','source_order','created_at','record_version','last_mutation_id') or not exists
   (select 1 from information_schema.columns where table_schema='app' and table_name=tbl and column_name=x)) then raise exception 'IMMUTABLE_FIELD';end if;
  if p->>'operation'='DELETE' then
   if nullif(btrim(p->>'reason'),'')is null then raise exception 'VALIDATION_FAILED';end if;
   execute format('delete from app.%I where %I=$1',tbl,pk)using id;a=null;
  else
   perform app.upsert_row(tbl,pk,a);
  end if;
  d=case when kind='VILLAGE' then coalesce(a->>'district',b->>'district')else(select district from app.villages where village_id=coalesce(a->>'village_id',b->>'village_id'))end;
  insert into app.entity_ledger(entity_type,entity_id,district,deleted_at,deletion_mutation)values(kind,id,d,case when a is null then now()end,case when a is null then mid end)
  on conflict(entity_type,entity_id)do update set district=excluded.district,deleted_at=excluded.deleted_at,deletion_mutation=excluded.deletion_mutation;
  return app.audit_commit(c,mid,rhash,'ADMIN_'||(p->>'operation'),kind,id,d,b,a,p->>'reason',jsonb_build_object('record',a));
 end if;
 raise exception 'UNKNOWN_ACTION';end $$;

create function api.login_identity(username text)returns jsonb language sql security definer set search_path=pg_catalog,public,app as $$
 select jsonb_build_object('identity',a.login_identity,'authId',i.auth_user_id)from app.accounts a join app.identities i using(actor_id)
 where a.username_normalized=lower(btrim(login_identity.username)) and a.status='ACTIVE' $$;
create function api.open_session(p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare a app.accounts;begin
 perform 1 from app.authority for update;
 select a0.* into a from app.accounts a0 join app.identities i using(actor_id)where i.auth_user_id=(p->>'authId')::uuid and a0.username_normalized=lower(btrim(p->>'username'))for update of a0;
 if not found or a.status<>'ACTIVE' then raise exception 'AUTH_INVALID';end if;
 if not history.vws_auth_session_exists((p->>'sessionId')::uuid,(p->>'authId')::uuid)then raise exception 'SESSION_INVALID';end if;
 if a.role='TECHNICIAN' and nullif(a.district,'')is null then raise exception 'ACCOUNT_DISTRICT_REQUIRED';end if;
 insert into app.sessions(token_hash,actor_id,auth_session_id,auth_cipher,auth_epoch)values(p->>'tokenHash',a.actor_id,(p->>'sessionId')::uuid,p->>'cipher',a.entitlement_version);
 update app.accounts set last_login_at=now()where actor_id=a.actor_id returning * into a;
 return jsonb_build_object('user',app.account_json(a));end $$;
create function api.session_secret(token_hash text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare a app.accounts;begin a=app.context(token_hash,true);return(select jsonb_build_object('cipher',s.auth_cipher,'identity',a.login_identity,'authId',i.auth_user_id,'sessionId',s.auth_session_id)
 from app.sessions s join app.identities i using(actor_id)where s.token_hash=api.session_secret.token_hash);end $$;
create function api.execute(token_hash text,action text,payload jsonb default '{}',mutation_id uuid default null,request_hash text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration,history as $$
declare c app.accounts;r jsonb;s app.water_systems;d text;begin
 c=app.context(token_hash,action in('auth.me','auth.logout','auth.changePassword'));
 case action
 when 'auth.me' then r=jsonb_build_object('user',app.account_json(c));
 when 'auth.logout' then update app.sessions set revoked_at=now()where app.sessions.token_hash=execute.token_hash;r='{}';
 when 'data.bootstrap' then r=jsonb_build_object('user',app.account_json(c),'permissions',case when c.role='ADMIN' then
 '["VIEW_MANAGEMENT","UPDATE_SYSTEM","DELETE_SYSTEM","VIEW_ENTITY_HISTORY","VIEW_GLOBAL_AUDIT","MANAGE_TECHNICIANS"]'::jsonb else '["VIEW_MANAGEMENT","UPDATE_SYSTEM","DELETE_SYSTEM","VIEW_ENTITY_HISTORY"]'::jsonb end,
 'featureFlags','{"technicianDistrictScope":true,"updateWaterSystem":true,"deleteWaterSystem":true,"entityHistory":true,"technicianUserManagement":true}',
 'session',jsonb_build_object('expiresAt',(select expires_at from app.sessions where app.sessions.token_hash=execute.token_hash),'idleTimeoutMinutes',30));
 when 'data.dashboard' then
  select snap.payload into r from integration.snapshots snap join app.authority au on au.epoch=snap.epoch and au.revision=snap.revision
  where snap.scope=case when c.role='ADMIN'then 'PRIVATE:ADMIN'else 'PRIVATE:DISTRICT:'||c.district end and snap.policy='PRIVATE_V1';
  if r is null then r=app.dashboard(c);end if;
 when 'data.waterSystem' then
  select * into s from app.water_systems where system_id=payload->>'systemId';if not found then raise exception 'NOT_FOUND';end if;
  select district into d from app.villages where village_id=s.village_id;if not app.visible(c,d)then raise exception 'FORBIDDEN';end if;
  r=jsonb_build_object('system',app.system_json(s,c));
 when 'data.entityHistory' then
  select coalesce((select district from app.villages v join app.water_systems w using(village_id)where w.system_id=payload->>'entityId'),
  (select district from app.entity_ledger where entity_type='WATER_SYSTEM' and entity_id=payload->>'entityId'))into d;
  if d is null or not app.visible(c,d)then raise exception 'FORBIDDEN';end if;
  r=app.entity_history(c,payload->>'entityId',coalesce((payload->>'limit')::int,200));
 when 'technicians.list' then
  if c.role<>'ADMIN' then raise exception 'FORBIDDEN';end if;
  select jsonb_build_object('technicians',coalesce(jsonb_agg(app.account_json(a)order by a.username),'[]'))into r from app.accounts a where a.role='TECHNICIAN';
 when 'data.updateWaterSystem','data.deleteWaterSystem','data.adminMutate' then r=app.mutate(c,action,payload,mutation_id,request_hash);
 else raise exception 'UNKNOWN_ACTION';
 end case;
 perform app.context(token_hash,action in('auth.me','auth.changePassword')) where action<>'auth.logout';
 perform app.touch(token_hash);return r;
end $$;
create function api.rate_limit(key text,max_count int,seconds int)returns bool language plpgsql security definer set search_path=pg_catalog,integration as $$
declare n int;begin insert into integration.rate_limits values(rate_limit.key,now(),1)on conflict on constraint rate_limits_pkey do update set
 count=case when rate_limits.window_start<now()-make_interval(secs=>seconds)then 1 else rate_limits.count+1 end,
 window_start=case when rate_limits.window_start<now()-make_interval(secs=>seconds)then now()else rate_limits.window_start end returning count into n;return n<=max_count;end $$;

-- Ownership is a non-login role with explicit RLS policies; only the server gateway gets EXECUTE.
do $$declare f record;begin for f in select p.oid::regprocedure as sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('app','api')loop
 execute format('alter function %s owner to vws_executor',f.sig);
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.nspname='api'then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;end $$;
grant usage on schema api to service_role;

commit;
