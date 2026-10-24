begin;
create function api.auth_job_begin(t text,act text,p jsonb,mid uuid,rhash text,cipher text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;a app.accounts;j integration.auth_jobs;req jsonb;ident text;begin
 c=app.context(t,act='auth.changePassword');
 if act<>'auth.changePassword'and c.role<>'ADMIN'then raise exception 'FORBIDDEN';end if;
 if act not in('technicians.create','technicians.resetPassword','auth.changePassword')or mid is null or length(coalesce(rhash,''))<>64 then raise exception 'VALIDATION_FAILED';end if;
 select * into j from integration.auth_jobs where job_id=mid;
 if found then if j.request_hash<>rhash or j.actor_id<>c.actor_id then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('jobId',j.job_id,'state',j.state,'result',j.result);end if;
 req=p;
 if act='technicians.create'then
  if nullif(btrim(p->>'username'),'')is null or nullif(btrim(p->>'displayName'),'')is null or not exists(select 1 from app.districts where name=p->>'district')then raise exception 'VALIDATION_FAILED';end if;
  if exists(select 1 from app.accounts where username_normalized=lower(btrim(p->>'username')))then raise exception 'USERNAME_IN_USE';end if;
  ident='vws-'||mid::text||'@'||(p->>'identityDomain');
  if ident !~ '^[a-z0-9@.\-]+$' or position('@'in ident)=0 then raise exception 'VALIDATION_FAILED';end if;
 else
  select * into a from app.accounts where actor_id=case when act='auth.changePassword'then c.actor_id else p->>'userId'end for update;
  if not found or (act<>'auth.changePassword'and a.role<>'TECHNICIAN')then raise exception 'NOT_FOUND';end if;
  if act<>'auth.changePassword'and app.version(to_jsonb(a)) is distinct from p->>'expectedVersion'then raise exception 'CONFLICT';end if;
  req=req||jsonb_build_object('userId',a.actor_id,'approvedVersion',a.record_version);ident=a.login_identity;
  if act='technicians.resetPassword'then
   update app.accounts set status='RESET_PENDING',entitlement_version=entitlement_version+1 where actor_id=a.actor_id;
   update app.sessions set revoked_at=now()where actor_id=a.actor_id;
  end if;
 end if;
 insert into integration.auth_jobs(job_id,request_hash,actor_id,token_hash,action,request,credential_cipher,provider_identity,target_auth_id)
 values(mid,rhash,c.actor_id,t,act,req,cipher,ident,(select auth_user_id from app.identities where actor_id=a.actor_id));
 perform app.touch(t);return jsonb_build_object('jobId',mid,'state','PENDING');end $$;
create function api.auth_job_state(t text,mid uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;j integration.auth_jobs;begin c=app.context(t,true);select * into j from integration.auth_jobs where job_id=mid;
 if not found or j.actor_id<>c.actor_id then raise exception 'FORBIDDEN';end if;
 return to_jsonb(j)||jsonb_build_object('target_auth_id',coalesce(j.target_auth_id,history.vws_auth_id_for_identity(j.provider_identity)));end $$;
create function api.auth_job_fail(t text,mid uuid,code text)returns void language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;begin c=app.context(t,true);update integration.auth_jobs set error_code=code,state='RETRY_REQUIRED'where job_id=mid and actor_id=c.actor_id and state<>'COMMITTED';end $$;
create function api.auth_job_finish(t text,mid uuid,auth_id uuid,session_id uuid default null,new_cipher text default null)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;a app.accounts;j integration.auth_jobs;b jsonb;r jsonb;actor text;begin
 c=app.context(t,true);select * into j from integration.auth_jobs where job_id=mid for update;
 if not found or j.actor_id<>c.actor_id then raise exception 'FORBIDDEN';end if;
 if j.state='COMMITTED'then return j.result;end if;
 if j.action<>'auth.changePassword'and c.role<>'ADMIN'then raise exception 'FORBIDDEN';end if;
 if not history.vws_auth_identity_matches(auth_id,j.provider_identity)then raise exception 'AUTH_PROVIDER_MISMATCH';end if;
 if j.action='technicians.create'then
  actor='USR-'||gen_random_uuid()::text;
  insert into app.identities(actor_id,auth_user_id)values(actor,auth_id);
  insert into app.accounts(actor_id,username,display_name,role,district,login_identity,must_change_password)
   values(actor,btrim(j.request->>'username'),btrim(j.request->>'displayName'),'TECHNICIAN',j.request->>'district',j.provider_identity,false)returning * into a;
 else
  select * into a from app.accounts where actor_id=j.request->>'userId'for update;
  if not found or a.record_version<>(j.request->>'approvedVersion')::bigint then raise exception 'CONFLICT';end if;
  b=to_jsonb(a);
  update app.accounts set status='ACTIVE',must_change_password=j.action='technicians.resetPassword',record_version=record_version+1,
   entitlement_version=entitlement_version+1,updated_at=now()where actor_id=a.actor_id returning * into a;
  update app.sessions set revoked_at=now()where actor_id=a.actor_id;
  if j.action='auth.changePassword'then
   if not history.vws_auth_session_exists(session_id,auth_id)then raise exception 'SESSION_INVALID';end if;
   update app.sessions set revoked_at=null,auth_session_id=session_id,auth_cipher=new_cipher,auth_epoch=a.entitlement_version,last_activity_at=now()where token_hash=t;
  end if;
 end if;
 r=app.audit_commit(c,mid,j.request_hash,case when j.action='technicians.create'then 'TECHNICIAN_CREATE'when j.action='auth.changePassword'then 'USER_PASSWORD_CHANGE'else 'TECHNICIAN_RESET_PASSWORD'end,
 'USER',a.actor_id,a.district,b,to_jsonb(a)-'login_identity','',jsonb_build_object('user',app.account_json(a)));
 update integration.auth_jobs set state='COMMITTED',result=r,credential_cipher=null,target_auth_id=auth_id,error_code=null where job_id=mid;return r;
end $$;
create function api.account_mutate(t text,act text,p jsonb,mid uuid,rhash text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;a app.accounts;b jsonb;r jsonb;prev integration.mutations;begin
 c=app.context(t);if c.role<>'ADMIN'then raise exception 'FORBIDDEN';end if;
 select * into prev from integration.mutations where mutation_id=mid;
 if found then if prev.actor_id<>c.actor_id or prev.request_hash<>rhash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prev.result;end if;
 if mid is null or length(coalesce(rhash,''))<>64 then raise exception 'IDEMPOTENCY_REQUIRED';end if;
 select * into a from app.accounts where actor_id=p->>'userId'and role='TECHNICIAN'for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if app.version(to_jsonb(a)) is distinct from p->>'expectedVersion'then raise exception 'CONFLICT';end if;b=to_jsonb(a);
 if act='technicians.update'then
  if nullif(btrim(p->>'username'),'')is null or nullif(btrim(p->>'displayName'),'')is null or not exists(select 1 from app.districts where name=p->>'district')then raise exception 'VALIDATION_FAILED';end if;
  update app.accounts set username=btrim(p->>'username'),display_name=btrim(p->>'displayName'),district=p->>'district',record_version=record_version+1,
   entitlement_version=entitlement_version+1,updated_at=now()where actor_id=a.actor_id returning * into a;
 elsif act in('technicians.enable','technicians.disable')then
  update app.accounts set status=case when act='technicians.enable'then 'ACTIVE'else 'DISABLED'end,record_version=record_version+1,
   entitlement_version=entitlement_version+1,updated_at=now()where actor_id=a.actor_id returning * into a;
 elsif act='technicians.delete'then
  if nullif(btrim(p->>'reason'),'')is null then raise exception 'VALIDATION_FAILED';end if;
  update app.identities set retired_at=now()where actor_id=a.actor_id;
  insert into app.entity_ledger(entity_type,entity_id,deleted_at,deletion_mutation,district)values('USER',a.actor_id,now(),mid,a.district);
  delete from app.accounts where actor_id=a.actor_id;
  -- No password/credential in cleanup job; provider deletion retries independently.
  insert into integration.auth_jobs(job_id,request_hash,actor_id,token_hash,action,request,target_auth_id)
  select mid,rhash,c.actor_id,t,'AUTH_DELETE',jsonb_build_object('userId',a.actor_id),auth_user_id from app.identities where actor_id=a.actor_id;
 else raise exception 'UNKNOWN_ACTION';end if;
 update app.sessions set revoked_at=now()where actor_id=a.actor_id;
 r=app.audit_commit(c,mid,rhash,case act when 'technicians.update'then 'TECHNICIAN_UPDATE'when 'technicians.enable'then 'TECHNICIAN_ENABLE'when 'technicians.disable'then 'TECHNICIAN_DISABLE'else 'TECHNICIAN_DELETE'end,
 'USER',a.actor_id,a.district,b-'login_identity',case when act='technicians.delete'then null else to_jsonb(a)-'login_identity'end,p->>'reason',
 jsonb_build_object('user',case when act='technicians.delete'then null else app.account_json(a)end,'deleted',act='technicians.delete','authCleanupPending',act='technicians.delete'));
 perform app.touch(t);return r;end $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'loop
 execute format('alter function %s owner to vws_executor',f.sig);execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;end $$;

commit;
