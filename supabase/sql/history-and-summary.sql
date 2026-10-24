-- Manual LOCAL-only candidate. Review before Hosted installation.
-- Apply after baseline 01-11 and management-retry-and-audit.sql; never reinstall.
begin;
do $$ begin
 if to_regprocedure('app.entity_history(app.accounts,text,integer)')is null
 or to_regprocedure('app.audit_commit(app.accounts,uuid,text,text,text,text,text,jsonb,jsonb,text,jsonb)')is null
 then raise exception 'VWS_HISTORY_BASELINE_REQUIRED';end if;
end $$;
-- Explicit system-field allowlist; never return account/session/credential fields.
create or replace function app.system_history_values(j jsonb,c app.accounts)returns jsonb
language plpgsql stable strict set search_path=pg_catalog,app as $$
declare result jsonb;shared jsonb;shared_input jsonb;begin
 result=app.pick(j,array['system_name','latitude','longitude','owner_type','responsible_agency','system_type','water_source_type','capacity_m3_hr','usage_type','households_served','construction_year_be','operational_status','utility_water_quality','drinking_water_quality','water_quantity','shared_with_other_village','shared_village_name','establishment_type','establishment_agency','transfer_year_be','transfer_agency','transfer_other','transfer_document_status','transfer_document_url','usage_types_json','quality_failure_categories_json','quality_failure_detail','water_pressure','year_round_status','available_months_json','beneficiaries','monthly_production_cost','monthly_service_revenue','water_tariff','service_agency','water_source_detail','surface_water_type','surface_water_agency','shared_villages_json','system_id','village_id','source_excel_row','system_no','construction_year_ce','created_at','updated_at','record_version','last_mutation_id']);
 -- Match the existing Technician read contract for shared villages.
 if c.role='TECHNICIAN'and nullif(result->>'shared_villages_json','')is not null then
  begin
   shared_input=(result->>'shared_villages_json')::jsonb;
   if jsonb_typeof(shared_input)<>'array'then raise invalid_parameter_value;end if;
   select coalesce(jsonb_agg(x),'[]')into shared from jsonb_array_elements(shared_input)x
   where exists(select 1 from app.villages v where v.village_id=coalesce(x->>'village_id',x->>'villageIdRef')and v.district=c.district);
   result=result||jsonb_build_object('shared_villages_json',shared::text,'shared_village_name','');
  exception when invalid_text_representation or invalid_parameter_value then
   -- Keep the other historical values usable without leaking unscopable text.
   result=(result-'shared_villages_json'-'shared_village_name')||jsonb_build_object('historyRedactedFields',jsonb_build_array('shared_villages_json','shared_village_name'));
  end;
 end if;
 return result;end
$$;
revoke all on function app.system_history_values(jsonb,app.accounts)from public,anon,authenticated;
grant execute on function app.system_history_values(jsonb,app.accounts)to vws_executor;
-- Existing history function owner, ACL, role/district checks and 200-row cap stay.
create or replace function app.entity_history(c app.accounts,id text,max_rows int)returns jsonb language sql stable set search_path=pg_catalog,app,history as $$
select jsonb_build_object('history',coalesce(jsonb_agg(j order by dt desc),'[]'))from(select j,dt from(
 select jsonb_build_object('auditId',audit_id,'action',action,'timestamp',committed_at,'userId',actor_id,'username',username_snapshot,'role',role_snapshot,'before',app.system_history_values(before_json,c),'after',app.system_history_values(after_json,c),'changedFields',changed_fields,'reason',reason,'status','COMMITTED')j,committed_at dt
 from history.audit_events h where entity_type='WATER_SYSTEM'and entity_id=id and app.visible(c,h.district)
 union all
 select jsonb_build_object('auditId',cells->>'audit_id','action',cells->>'action','timestamp',cells->>'timestamp','userId',cells->>'user_id','username',cells->>'username_snapshot','role',cells->>'role_snapshot',
 'before',app.system_history_values(nullif(cells->>'before_json','')::jsonb,c),'after',app.system_history_values(nullif(cells->>'after_json','')::jsonb,c),'changedFields',coalesce(nullif(cells->>'changed_fields_json','')::jsonb,'[]'),'reason',cells->>'reason','status',classification), (cells->>'timestamp')::timestamptz
 from history.legacy_audit l where cells->>'entity_type'='WATER_SYSTEM'and cells->>'entity_id'=id and classification in('COMMITTED','FAILED')
 and app.visible(c,coalesce((select district from app.entity_ledger e where e.entity_type='WATER_SYSTEM'and e.entity_id=id),
 (select district from app.villages v where v.village_id=coalesce((nullif(cells->>'before_json','')::jsonb)->>'village_id',(nullif(cells->>'after_json','')::jsonb)->>'village_id'))))
)events order by dt desc limit least(max_rows,200))q $$;

-- Summary is built in the commit transaction and persisted in the same receipt.
create or replace function app.audit_commit(c app.accounts,mid uuid,rhash text,act text,kind text,id text,d text,b jsonb,a jsonb,reason text,result jsonb) returns jsonb
language plpgsql set search_path=pg_catalog,public,app,integration,history as $$
declare r bigint;e uuid;outj jsonb;begin
 update app.authority as authority_row set revision=authority_row.revision+1 where authority_row.singleton is true returning authority_row.revision,authority_row.epoch into r,e;
 outj=audit_commit.result||jsonb_build_object('sourceRevision',r,'epoch',e)
  ||case when kind='WATER_SYSTEM'and act='SYSTEM_UPDATE'then jsonb_build_object('changeSummary',jsonb_build_object(
   'mutationId',mid,'before',app.system_history_values(b,c),'after',app.system_history_values(a,c)))else '{}'::jsonb end;
 insert into history.audit_events(mutation_id,actor_id,username_snapshot,role_snapshot,action,entity_type,entity_id,district,before_json,after_json,changed_fields,reason)
 values(mid,c.actor_id,c.username,c.role,act,kind,id,d,b,a,coalesce((select jsonb_agg(fields.field_name) from jsonb_object_keys(coalesce(b,'{}')||coalesce(a,'{}'))as fields(field_name) where b->fields.field_name is distinct from a->fields.field_name),'[]'),audit_commit.reason);
 insert into integration.outbox(epoch,revision,mutation_id,entity_type,entity_id,operation,district)values(e,r,mid,kind,id,case when a is null then 'DELETE' else 'UPSERT' end,d);
 insert into integration.mutations(mutation_id,actor_id,request_hash,result,revision)values(mid,c.actor_id,rhash,outj,r);
 return outj;end $$;

commit;
