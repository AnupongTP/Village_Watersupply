begin;
create index on ingest.submissions(processed_system_id)where processed_system_id is not null;
create function app.pick(j jsonb,fields text[])returns jsonb language sql immutable as $$select jsonb_object_agg(k,v)from jsonb_each(j)x(k,v)where k=any(fields)$$;
create function app.public_expected()returns jsonb language plpgsql stable set search_path=pg_catalog,app as $$
declare c app.accounts;r jsonb;begin c.role='ADMIN';
select jsonb_build_object(
'villages',coalesce((select jsonb_agg(app.pick(app.village_json(v),array['village_id','province','district','subdistrict','local_authority','village_no','village_name','has_village_waterworks','pwa_households','mwa_households','commercial_households','other_village_pipe_households','waterbank_households','self_source_households','natural_source_households'])order by village_id collate "C")from app.villages v where(app.village_json(v)->>'publicVisible')::bool),'[]'),
'waterSystems',coalesce((select jsonb_agg(app.pick(app.system_json(s,c),array['system_id','village_id','system_name','latitude','longitude','operational_status','drinking_water_quality','water_quantity','households_served','owner_type','system_type','water_source_type','capacity_m3_hr','usage_type','construction_year_be','utility_water_quality','shared_with_other_village','establishment_type','transfer_year_be','transfer_document_status'])order by system_id collate "C")from app.water_systems s where(app.system_json(s,c)->>'publicVisible')::bool),'[]'),
'waterSources',coalesce((select jsonb_agg(app.pick(app.compat(to_jsonb(s)),array['source_id','village_id','source_type','households'])order by source_id collate "C")from app.village_water_sources s join app.villages v using(village_id)where(app.village_json(v)->>'publicVisible')::bool),'[]'))into r;return r;end $$;
create function app.validate_public_snapshot()returns trigger language plpgsql set search_path=pg_catalog,app as $$
declare expected jsonb;c app.accounts;begin
 if(new.payload->>'sourceRevision')::bigint is distinct from new.revision or(new.payload->>'epoch')::uuid is distinct from new.epoch then raise exception 'SNAPSHOT_VERSION_MISMATCH';end if;
 if new.scope='PUBLIC'then
 if new.policy<>'PUBLIC_ALLOWLIST_R5_1_V1'then raise exception 'PUBLIC_POLICY_REQUIRED';end if;
 expected=app.public_expected();if expected->'villages'is distinct from new.payload->'villages'or expected->'waterSystems'is distinct from new.payload->'waterSystems'or expected->'waterSources'is distinct from new.payload->'waterSources'then raise exception 'PUBLIC_PROJECTION_MISMATCH';end if;
 if exists(select 1 from jsonb_object_keys(new.payload)k where k not in('success','villages','waterSystems','waterSources','generatedAt','sourceRevision','epoch','projection','projectionOwner','suppression','datasetVersion'))then raise exception 'PUBLIC_METADATA_VIOLATION';end if;
 if new.payload->'projection'is distinct from '{"policy":"PUBLIC_ALLOWLIST_R5_1_V1"}'::jsonb or new.payload->>'projectionOwner'is distinct from 'SERVER_R5_1'or new.payload->'success'is distinct from 'true'::jsonb then raise exception 'PUBLIC_METADATA_VIOLATION';end if;
 if exists(select 1 from jsonb_each(new.payload->'suppression')x(k,v)where k<>'rule'and(jsonb_typeof(v)<>'number'or k not in('hiddenMissingCoordinateSystems','hiddenWaterworksVillagesWithoutSystem','hiddenIssueRows','inputVillages','inputWaterSystems','outputVillages','outputWaterSystems')))then raise exception 'PUBLIC_METADATA_VIOLATION';end if;
 else
 if new.policy<>'PRIVATE_V1'then raise exception 'PRIVATE_POLICY_REQUIRED';end if;
 if new.scope='PRIVATE:ADMIN'then c.role='ADMIN';elsif new.scope like 'PRIVATE:DISTRICT:%'then c.role='TECHNICIAN';c.district=substr(new.scope,length('PRIVATE:DISTRICT:')+1);else raise exception 'SNAPSHOT_SCOPE_UNSUPPORTED';end if;
 expected=app.dashboard(c);
 if expected->'villages'is distinct from new.payload->'villages'or expected->'waterSystems'is distinct from new.payload->'waterSystems'or expected->'waterSources'is distinct from new.payload->'waterSources'then raise exception 'PRIVATE_SCOPE_MISMATCH';end if;
 if exists(select 1 from jsonb_object_keys(new.payload)k where k not in('generatedAt','sourceRevision','epoch','villages','waterSystems','waterSources'))then raise exception 'PRIVATE_METADATA_VIOLATION';end if;
 end if;return new;end $$;
alter function app.pick(jsonb,text[])owner to vws_executor;alter function app.public_expected()owner to vws_executor;alter function app.validate_public_snapshot()owner to vws_executor;
revoke all on function app.pick(jsonb,text[]),app.public_expected(),app.validate_public_snapshot()from public,anon,authenticated;
create trigger public_snapshot_boundary before insert or update on integration.snapshots for each row execute function app.validate_public_snapshot();
commit;
