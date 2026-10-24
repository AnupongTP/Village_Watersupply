begin;
-- Nullable means missing. Numeric zero remains a distinct accepted value.
do $$declare x record;begin
for x in select table_name,column_name from information_schema.columns where table_schema='app'and table_name in('villages','water_systems','village_water_sources')
and data_type in('integer','bigint','numeric','double precision')
and(column_name like '%households' or column_name in('households_served','households','beneficiaries','capacity_m3_hr','monthly_production_cost','monthly_service_revenue','water_tariff','village_no'))loop
execute format('alter table app.%I add check(%I>=0)',x.table_name,x.column_name);end loop;end $$;
alter table app.water_systems add check(latitude between -90 and 90),add check(longitude between -180 and 180);
create function api.login_success(key text)returns void language sql security definer set search_path=pg_catalog,integration as $$delete from integration.rate_limits where rate_limits.key=login_success.key$$;
create function api.job_receipt(t text,mid uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app,integration as $$
declare c app.accounts;j integration.auth_jobs;begin c=app.context(t,true);select * into j from integration.auth_jobs where job_id=mid and actor_id=c.actor_id;
if not found then raise exception 'NOT_FOUND';end if;return jsonb_build_object('jobId',j.job_id,'action',j.action,'state',j.state,'result',j.result,'errorCode',j.error_code);end $$;
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api'loop
 execute format('alter function %s owner to vws_executor',f.sig);execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;end $$;
commit;
