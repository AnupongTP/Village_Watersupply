begin;
-- Fresh installation only. Never overwrite application objects or managed Auth objects.
do $$ begin
 if current_setting('server_version_num')::int < 160000 then raise exception 'VWS_REQUIRES_POSTGRES_16_OR_NEWER_REVIEW'; end if;
 if exists(select 1 from pg_namespace where nspname in('app','api','ingest','integration','history')) then raise exception 'VWS_APPLICATION_SCHEMA_EXISTS_STOP_FOR_REVIEW'; end if;
 if to_regclass('auth.users') is null or to_regclass('auth.sessions') is null then raise exception 'VWS_MANAGED_AUTH_MISSING'; end if;
 if not has_schema_privilege(current_user,'auth','USAGE') or not has_column_privilege(current_user,'auth.users','id','SELECT')
 or not has_column_privilege(current_user,'auth.users','email','SELECT') or not has_column_privilege(current_user,'auth.users','id','REFERENCES')
 or not has_column_privilege(current_user,'auth.sessions','id','SELECT') or not has_column_privilege(current_user,'auth.sessions','user_id','SELECT') then raise exception 'VWS_INSTALLER_AUTH_PRIVILEGES_MISSING'; end if;
 if exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname<>'extensions') then raise exception 'VWS_PGCRYPTO_SCHEMA_MISMATCH_STOP_FOR_REVIEW'; end if;
end $$;

-- LOCAL candidate. Never auto-apply to a remote database.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;
create schema if not exists ingest;
create schema if not exists integration;
create schema if not exists history;
create schema if not exists api;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='vws_executor') then
  create role vws_executor nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  grant vws_executor to current_user with inherit true, set true;
 else
  if exists(select 1 from pg_roles where rolname='vws_executor' and (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole))
   or not pg_has_role(current_user,'vws_executor','USAGE') or not pg_has_role(current_user,'vws_executor','SET') then raise exception 'VWS_EXISTING_EXECUTOR_REQUIRES_REVIEW'; end if;
 end if;
end $$;
grant usage on schema app,ingest,integration,history,api to vws_executor;
-- Required for ALTER FUNCTION OWNER; removed by the final compatibility patch.
grant create on schema app,api to vws_executor;
do $$ begin
 if not has_schema_privilege('vws_executor','extensions','USAGE') then grant usage on schema extensions to vws_executor; end if;
 if to_regprocedure('extensions.digest(text,text)') is null then raise exception 'VWS_DIGEST_MISSING';end if;
 if not has_schema_privilege('vws_executor','extensions','USAGE') or not has_function_privilege('vws_executor','extensions.digest(text,text)','EXECUTE') then raise exception 'VWS_EXECUTOR_DIGEST_ACCESS_MISSING';end if;
end $$;
create table app.authority(epoch uuid not null default gen_random_uuid(),revision bigint not null default 0, singleton bool primary key default true check(singleton));
insert into app.authority(singleton)values(true);
create table app.districts(name text primary key check(length(name)>0));
create table app.identities(actor_id text primary key,auth_user_id uuid unique references auth.users(id) on delete set null,retired_at timestamptz);
create table app.accounts(actor_id text primary key references app.identities,username text not null,username_normalized text generated always as(lower(btrim(username)))stored unique,
 display_name text not null,role text not null check(role in('ADMIN','TECHNICIAN')),status text not null default 'ACTIVE' check(status in('ACTIVE','DISABLED','RESET_PENDING')),
 district text references app.districts(name),must_change_password bool not null default false,entitlement_version bigint not null default 1,record_version bigint not null default 1,
 login_identity text unique not null,last_login_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table app.sessions(token_hash text primary key,actor_id text not null references app.identities,auth_session_id uuid not null,
 auth_cipher text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '8 hours'),
 last_activity_at timestamptz not null default now(),revoked_at timestamptz,auth_epoch bigint not null);
create table app.villages(
"village_id" text primary key,
"source_excel_row" bigint,
"source_order" bigint,
"province" text,
"district" text,
"subdistrict" text,
"local_authority" text,
"village_no" text,
"village_name" text,
"has_village_waterworks" boolean,
"water_from_raw" text,
"pwa_households" bigint,
"mwa_households" bigint,
"commercial_households" bigint,
"other_village_pipe_households" bigint,
"waterbank_households" bigint,
"self_source_households" bigint,
"natural_source_households" bigint,
"created_at" timestamptz,
"updated_at" timestamptz,
"community_type" text,
"dla_village_code" text,
record_version bigint not null default 1,last_mutation_id uuid);
create table app.water_systems(
"system_id" text primary key,
"village_id" text not null references app.villages(village_id) on delete restrict,
"source_excel_row" bigint,
"system_no" bigint,
"system_name" text,
"latitude" numeric,
"longitude" numeric,
"owner_type" text,
"responsible_agency" text,
"system_type" text,
"water_source_type" text,
"capacity_m3_hr" numeric,
"usage_type" text,
"households_served" bigint,
"construction_year_be" bigint,
"construction_year_ce" bigint,
"operational_status" text,
"utility_water_quality" text,
"drinking_water_quality" text,
"water_quantity" text,
"shared_with_other_village" text,
"shared_village_name" text,
"establishment_type" text,
"establishment_agency" text,
"transfer_year_be" bigint,
"transfer_agency" text,
"transfer_other" text,
"transfer_document_status" text,
"transfer_document_url" text,
"created_at" timestamptz,
"updated_at" timestamptz,
"usage_types_json" text,
"quality_failure_categories_json" text,
"quality_failure_detail" text,
"water_pressure" text,
"year_round_status" text,
"available_months_json" text,
"beneficiaries" bigint,
"monthly_production_cost" numeric,
"monthly_service_revenue" numeric,
"water_tariff" numeric,
"service_agency" text,
"water_source_detail" text,
"surface_water_type" text,
"surface_water_agency" text,
"shared_villages_json" text,
record_version bigint not null default 1,last_mutation_id uuid);
create table app.village_water_sources(
"source_id" text primary key,
"village_id" text not null references app.villages(village_id) on delete restrict,
"source_excel_row" bigint,
"source_type" text,
"households" bigint,
record_version bigint not null default 1,last_mutation_id uuid);

alter table app.villages add constraint village_district foreign key(district) references app.districts(name);
create index on app.villages(district,village_id);
create index on app.water_systems(village_id,system_id);
create index on app.village_water_sources(village_id);
create table app.entity_ledger(entity_type text not null,entity_id text not null,origin_submission_id text unique,deleted_at timestamptz,deletion_mutation uuid,district text,primary key(entity_type,entity_id));
create table ingest.submissions(receipt_id uuid primary key default gen_random_uuid(),submission_id text unique,payload_hash text not null,raw_payload jsonb not null,raw_cells jsonb not null default '{}',
 status text not null default 'RECEIVED' check(status in('RECEIVED','PROCESSING','PROCESSED','FAILED','QUARANTINED')),
 processed_village_id text,processed_system_id text,processor_version text,attempts int not null default 0,error_code text,received_at timestamptz default now(),processed_at timestamptz,
 import_identity text unique,lease_generation bigint not null default 0,lease_until timestamptz);
create table history.audit_events(audit_id uuid primary key default gen_random_uuid(),mutation_id uuid not null,actor_id text not null references app.identities,
 username_snapshot text,role_snapshot text,action text not null,entity_type text not null,entity_id text not null,district text,before_json jsonb,after_json jsonb,changed_fields jsonb not null default '[]',
 reason text,committed_at timestamptz not null default now(),ordinal int not null default 0,unique(mutation_id,ordinal));
create index on history.audit_events(entity_type,entity_id,committed_at desc);
create table history.legacy_audit(import_identity text primary key,cells jsonb not null,classification text not null default 'UNVERIFIED');
create table history.legacy_record_control(import_identity text primary key,cells jsonb not null,classification text not null default 'UNVERIFIED');
create table integration.mutations(mutation_id uuid primary key,actor_id text not null,request_hash text not null,result jsonb not null,revision bigint not null,created_at timestamptz default now());
create table integration.outbox(event_id uuid primary key default gen_random_uuid(),epoch uuid not null,revision bigint not null,ordinal int not null default 0,mutation_id uuid not null,
 entity_type text not null,entity_id text not null,operation text not null check(operation in('UPSERT','DELETE','REBUILD')),district text,created_at timestamptz default now(),unique(epoch,revision,ordinal));
create table integration.bindings(binding_id uuid primary key default gen_random_uuid(),label text not null,workbook_id text not null,tab_id int not null,district text references app.districts(name),
 entity_type text not null,columns jsonb not null,enabled bool not null default false,requires_reconciliation bool not null default true,verified_revision bigint not null default 0);
create table integration.deliveries(event_id uuid references integration.outbox,binding_id uuid references integration.bindings,
 state text not null default 'PENDING',attempts int not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,lease_generation bigint not null default 0,
 last_error_code text,verified_at timestamptz,primary key(event_id,binding_id));
create index on integration.deliveries(state,next_attempt_at);
create table integration.sheet_rows(binding_id uuid references integration.bindings,entity_id text,base_image jsonb not null,version text not null,hash text not null,primary key(binding_id,entity_id));
create table integration.edit_batches(batch_id uuid primary key,binding_id uuid not null references integration.bindings,actor_id text not null,request_hash text not null,items jsonb not null,
 state text not null default 'SUBMITTED',result jsonb,created_at timestamptz default now());
create table integration.conflicts(conflict_id uuid primary key default gen_random_uuid(),batch_id uuid references integration.edit_batches,entity_id text,reason text not null,
 base_image jsonb,draft_image jsonb,current_image jsonb,state text not null default 'OPEN',resolved_mutation uuid,created_at timestamptz default now());
create table integration.reconciliation_runs(run_id uuid primary key default gen_random_uuid(),binding_id uuid references integration.bindings,state text not null,
 report jsonb not null default '{}',started_at timestamptz default now(),completed_at timestamptz);
create table integration.auth_jobs(job_id uuid primary key,request_hash text not null,actor_id text not null,token_hash text not null,action text not null,request jsonb not null,
 credential_cipher text,provider_identity text,target_auth_id uuid,state text not null default 'PENDING',result jsonb,error_code text,created_at timestamptz default now());
create table integration.snapshots(scope text primary key,epoch uuid not null,revision bigint not null,policy text not null,hash text not null,payload jsonb not null,built_at timestamptz default now());
create table integration.rate_limits(key text primary key,window_start timestamptz not null,count int not null);

do $$ declare t record;begin for t in select schemaname,tablename from pg_tables where schemaname in('app','ingest','integration','history')loop
 execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
 execute format('create policy executor_only on %I.%I to vws_executor using(true) with check(true)',t.schemaname,t.tablename);
 end loop;end $$;
grant select,insert,update,delete on all tables in schema app,ingest,integration,history to vws_executor;

revoke all on schema app,ingest,integration,history from public,anon,authenticated;
revoke all on all tables in schema app,ingest,integration,history from public,anon,authenticated;

-- Narrow managed-Auth adapters. Owner stays the installer (postgres in SQL Editor).
-- Not in app/api: subsequent ownership loops must NOT transfer these to vws_executor.
create function history.vws_auth_session_exists(p_session_id uuid,p_user_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id)
$$;
create function history.vws_auth_identity_matches(p_user_id uuid,p_identity_email text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user_id and u.email=p_identity_email)
$$;
create function history.vws_auth_id_for_identity(p_identity_email text) returns uuid
 language sql stable security definer set search_path='' as $$
 select (select u.id from auth.users u where u.email=p_identity_email)
$$;
revoke all on function history.vws_auth_session_exists(uuid,uuid),history.vws_auth_identity_matches(uuid,text),history.vws_auth_id_for_identity(text) from public,anon,authenticated,service_role;
grant execute on function history.vws_auth_session_exists(uuid,uuid),history.vws_auth_identity_matches(uuid,text),history.vws_auth_id_for_identity(text) to vws_executor;

commit;
