-- Manual upgrade: remove mandatory password-change policy only.
-- Reviewed LOCAL source. No Hosted SQL has been executed.
-- Keep signatures, owners and ACLs; no password or Auth-user changes.
begin;
do $$ begin
 if to_regprocedure('app.context(text,boolean)') is null
 or to_regprocedure('api.auth_job_finish(text,uuid,uuid,uuid,text)') is null then
  raise exception 'VWS_AUTH_BASELINE_REQUIRED';
 end if;
end $$;

create or replace function app.account_json(a app.accounts) returns jsonb language sql stable set search_path=pg_catalog,public,app as $$
 select jsonb_build_object('userId',a.actor_id,'username',a.username,'displayName',a.display_name,'role',a.role,'status',a.status,'district',a.district,
 'mustChangePassword',false,'recordVersion',app.version(to_jsonb(a)),'lastLoginAt',a.last_login_at) $$;

create or replace function app.context(t text,allow_password boolean default false) returns app.accounts language plpgsql set search_path=pg_catalog,public,app as $$
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
 if a.role='TECHNICIAN' and coalesce(a.district,'')='' then raise exception 'ACCOUNT_DISTRICT_REQUIRED';end if;
 return a;end $$;

create or replace function api.auth_job_finish(t text,mid uuid,auth_id uuid,session_id uuid default null,new_cipher text default null)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
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
  update app.accounts set status='ACTIVE',must_change_password=false,record_version=record_version+1,
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

-- Serialize policy changes with existing Management operations.
-- Existing flags are cleared with ordinary audit/outbox receipts, once per account.
do $$
declare c app.accounts; a app.accounts; b jsonb; mid uuid;
begin
 perform 1 from app.authority where singleton is true for update;
 if exists(select 1 from app.accounts where must_change_password) then
  select x.* into c from app.accounts x join app.identities i using(actor_id)
   where x.role='ADMIN' and x.status='ACTIVE' order by x.actor_id limit 1;
  if not found then raise exception 'VWS_POLICY_AUDIT_ADMIN_REQUIRED';end if;
  for a in select * from app.accounts where must_change_password order by actor_id for update loop
   b=to_jsonb(a)-'login_identity';mid=gen_random_uuid();
   update app.accounts set must_change_password=false,record_version=record_version+1,updated_at=now()
    where actor_id=a.actor_id returning * into a;
   perform app.audit_commit(c,mid,encode(extensions.digest('DISABLE_FORCED_PASSWORD_CHANGE:'||a.actor_id,'sha256'),'hex'),
    'ACCOUNT_PASSWORD_POLICY_CHANGED','USER',a.actor_id,a.district,b,to_jsonb(a)-'login_identity',
    'Disable mandatory password changes; administrative SQL policy migration',jsonb_build_object('userId',a.actor_id));
  end loop;
 end if;
end $$;
commit;
