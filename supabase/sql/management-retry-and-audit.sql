-- Manual LOCAL-reviewed patch after install/01-11. Never auto-apply.
begin;
create or replace function app.audit_commit(c app.accounts,mid uuid,rhash text,act text,kind text,id text,d text,b jsonb,a jsonb,reason text,result jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public,app,integration,history as $$
declare r bigint;e uuid;outj jsonb;begin
 update app.authority as authority_row set revision=authority_row.revision+1 where authority_row.singleton is true returning authority_row.revision,authority_row.epoch into r,e;
 outj=audit_commit.result||jsonb_build_object('sourceRevision',r,'epoch',e);
 insert into history.audit_events(mutation_id,actor_id,username_snapshot,role_snapshot,action,entity_type,entity_id,district,before_json,after_json,changed_fields,reason)
 values(mid,c.actor_id,c.username,c.role,act,kind,id,d,b,a,coalesce((select jsonb_agg(fields.field_name) from jsonb_object_keys(coalesce(b,'{}')||coalesce(a,'{}'))as fields(field_name) where b->fields.field_name is distinct from a->fields.field_name),'[]'),audit_commit.reason);
 insert into integration.outbox(epoch,revision,mutation_id,entity_type,entity_id,operation,district)values(e,r,mid,kind,id,case when a is null then 'DELETE' else 'UPSERT' end,d);
 insert into integration.mutations(mutation_id,actor_id,request_hash,result,revision)values(mid,c.actor_id,rhash,outj,r);
 return outj;end $$;
create or replace function api.auth_job_begin(t text,act text,p jsonb,mid uuid,rhash text,cipher text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;a app.accounts;j integration.auth_jobs;req jsonb;ident text;pending_job integration.auth_jobs;begin
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
  -- app.context holds the existing authority lock: reserve a normalized username
  -- across pending jobs before any provider user is created, including new tabs.
  select * into pending_job from integration.auth_jobs j0 where j0.action='technicians.create'
   and j0.state<>'COMMITTED' and lower(btrim(j0.request->>'username'))=lower(btrim(p->>'username'))
   order by j0.created_at limit 1;
  if found then
   if pending_job.actor_id<>c.actor_id or pending_job.request_hash<>rhash then raise exception 'AUTH_JOB_PENDING';end if;
   return jsonb_build_object('jobId',pending_job.job_id,'state',pending_job.state,'result',pending_job.result);
  end if;

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
commit;
