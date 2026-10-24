-- Manual LOCAL-reviewed upgrade; not executed against Hosted Supabase.
-- Apply after install/01-11 on a fresh database, or to the existing baseline.
-- Keep the existing RPC name so public-data and the website need no changes.
begin;

-- Fail closed rather than accidentally creating a new privileged API on an
-- unknown installation. CREATE OR REPLACE preserves the existing owner/ACL.
do $$ begin
 if to_regprocedure('api.public_snapshot()') is null
    or to_regprocedure('app.public_expected()') is null then
  raise exception 'VWS_PUBLIC_BASELINE_REQUIRED';
 end if;
end $$;

create or replace function api.public_snapshot() returns jsonb
language sql stable security definer
set search_path=pg_catalog,app,integration
as $$
 with public_data as materialized (
  -- Existing server allowlists and R5.1/Processor visibility rules, never raw
  -- management rows. STABLE gives all reads the calling statement's snapshot.
  select app.public_expected() as payload
 ), eligible as materialized (
  select s.latitude,s.longitude from app.water_systems s
  where (app.guard(s.system_id)->>'mutable')::boolean
 ), counts as (
  select
   (select count(*) from app.villages) as input_villages,
   (select count(*) from eligible) as input_systems,
   (select count(*) from eligible where latitude is null or longitude is null) as missing_coordinates
 )
 select d.payload || jsonb_build_object(
  'success',true,
  'generatedAt',statement_timestamp(),
  'sourceRevision',a.revision,
  'epoch',a.epoch,
  'projection',jsonb_build_object('policy','PUBLIC_ALLOWLIST_R5_1_V1'),
  'projectionOwner','SERVER_R5_1',
  'suppression',jsonb_build_object(
   'rule','R5_1_TEMP_HIDE_244',
   'hiddenMissingCoordinateSystems',n.missing_coordinates,
   'hiddenWaterworksVillagesWithoutSystem',n.input_villages-jsonb_array_length(d.payload->'villages'),
   'hiddenIssueRows',n.missing_coordinates+n.input_villages-jsonb_array_length(d.payload->'villages'),
   'inputVillages',n.input_villages,
   'inputWaterSystems',n.input_systems,
   'outputVillages',jsonb_array_length(d.payload->'villages'),
   'outputWaterSystems',jsonb_array_length(d.payload->'waterSystems')
  ),
  -- Opaque content identifier: stable for unchanged public data, independent
  -- of generatedAt and unrelated account/audit revision increments.
  'datasetVersion',encode(extensions.digest(
   (d.payload || jsonb_build_object('policy','PUBLIC_ALLOWLIST_R5_1_V1'))::text,'sha256'),'hex')
 )
 from public_data d cross join counts n cross join app.authority a
 where a.singleton is true
$$;

commit;
