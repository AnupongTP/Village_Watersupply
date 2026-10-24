begin;
create function api.receipt(t text,mid uuid,rhash text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;m integration.mutations;begin c=app.context(t);select * into m from integration.mutations where mutation_id=mid;
 if not found then return null;end if;if m.actor_id<>c.actor_id or m.request_hash<>rhash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return m.result;end $$;
create function api.public_source()returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare c app.accounts;begin c.role='ADMIN';return app.dashboard(c);end $$;
create function api.snapshot_publish(p jsonb)returns bool language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare a app.authority;old integration.snapshots;begin select * into a from app.authority for update;
 if a.epoch<>(p->>'epoch')::uuid or a.revision<>(p->>'revision')::bigint then return false;end if;
 if coalesce(p->>'hash','')!~'^[0-9a-f]{64}$'then raise exception 'INVALID_SNAPSHOT_HASH';end if;
 select * into old from integration.snapshots where scope=p->>'scope';
 if found and old.epoch=a.epoch and old.revision=a.revision and(old.policy<>p->>'policy'or old.hash<>p->>'hash')then raise exception 'SNAPSHOT_CONTENT_CONFLICT';end if;
 insert into integration.snapshots(scope,epoch,revision,policy,hash,payload)values(p->>'scope',a.epoch,a.revision,p->>'policy',p->>'hash',p->'payload')
 on conflict(scope)do update set epoch=excluded.epoch,revision=excluded.revision,policy=excluded.policy,hash=excluded.hash,payload=excluded.payload,built_at=now()
 where snapshots.epoch<>excluded.epoch or snapshots.revision<=excluded.revision;return found;end $$;
create function api.public_snapshot()returns jsonb language sql security definer set search_path=pg_catalog,app,integration as $$
 select payload from integration.snapshots s join app.authority a on a.epoch=s.epoch and a.revision=s.revision
 where scope='PUBLIC'and policy='PUBLIC_ALLOWLIST_R5_1_V1' $$;
create function api.private_snapshot_source(district text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare c app.accounts;begin c.role=case when district is null then 'ADMIN'else 'TECHNICIAN'end;c.district=district;return app.dashboard(c);end $$;
create function api.revision(t text)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app as $$
declare c app.accounts;r jsonb;begin c=app.context(t);select jsonb_build_object('epoch',epoch,'sourceRevision',revision,'entitlementVersion',c.entitlement_version)into r from app.authority;perform app.touch(t);return r;end $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'loop
 execute format('alter function %s owner to vws_executor',f.sig);execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;end $$;

commit;
