begin;
create function app.entity_history(c app.accounts,id text,max_rows int)returns jsonb language sql stable set search_path=pg_catalog,app,history as $$
select jsonb_build_object('history',coalesce(jsonb_agg(j order by dt desc),'[]'))from(select j,dt from(
 select jsonb_build_object('auditId',audit_id,'action',action,'timestamp',committed_at,'userId',actor_id,'username',username_snapshot,'role',role_snapshot,'changedFields',changed_fields,'reason',reason,'status','COMMITTED')j,committed_at dt
 from history.audit_events h where entity_type='WATER_SYSTEM'and entity_id=id and app.visible(c,h.district)
 union all
 select jsonb_build_object('auditId',cells->>'audit_id','action',cells->>'action','timestamp',cells->>'timestamp','userId',cells->>'user_id','username',cells->>'username_snapshot','role',cells->>'role_snapshot',
 'changedFields',coalesce(nullif(cells->>'changed_fields_json','')::jsonb,'[]'),'reason',cells->>'reason','status',classification), (cells->>'timestamp')::timestamptz
 from history.legacy_audit l where cells->>'entity_type'='WATER_SYSTEM'and cells->>'entity_id'=id and classification in('COMMITTED','FAILED')
 and app.visible(c,coalesce((select district from app.entity_ledger e where e.entity_type='WATER_SYSTEM'and e.entity_id=id),
 (select district from app.villages v where v.village_id=coalesce((nullif(cells->>'before_json','')::jsonb)->>'village_id',(nullif(cells->>'after_json','')::jsonb)->>'village_id'))))
)events order by dt desc limit least(max_rows,200))q $$;
alter function app.entity_history(app.accounts,text,integer)owner to vws_executor;
revoke all on function app.entity_history(app.accounts,text,integer)from public,anon,authenticated;
commit;
