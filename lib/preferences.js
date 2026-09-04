import { query } from './db.js';

const DELTAS={useful:8,more_like_this:14,not_useful:-10,too_noisy:-15,wrong_interpretation:-6,wrong_fact:-4};

export async function applyFeedbackLearning({workspaceId,objectType,objectId,feedbackType}){
  if(objectType==='company'&&feedbackType==='not_competitor'){
    await query(`UPDATE companies SET classification='watchlist',status='dismissed',updated_at=now() WHERE id=$1 AND workspace_id=$2`,[objectId,workspaceId]);
    await query(`UPDATE relationships SET status='dismissed',updated_at=now() WHERE target_company_id=$1 AND workspace_id=$2`,[objectId,workspaceId]);
    return;
  }
  if(objectType!=='signal'||!DELTAS[feedbackType])return;
  const signal=(await query('SELECT category,company_id FROM signals WHERE id=$1 AND workspace_id=$2',[objectId,workspaceId])).rows[0];
  if(!signal)return;
  await query(`INSERT INTO intelligence_preferences(workspace_id,category_weights,entity_weights,updated_at)
    VALUES($1,jsonb_build_object($2,$3),jsonb_build_object($4,$3),now())
    ON CONFLICT(workspace_id) DO UPDATE SET
      category_weights=jsonb_set(COALESCE(intelligence_preferences.category_weights,'{}'::jsonb),ARRAY[$2],to_jsonb(GREATEST(-50,LEAST(50,COALESCE((intelligence_preferences.category_weights->>$2)::int,0)+$3))),true),
      entity_weights=jsonb_set(COALESCE(intelligence_preferences.entity_weights,'{}'::jsonb),ARRAY[$4],to_jsonb(GREATEST(-50,LEAST(50,COALESCE((intelligence_preferences.entity_weights->>$4)::int,0)+$3))),true),
      updated_at=now()`,[workspaceId,signal.category,DELTAS[feedbackType],signal.company_id]);
}

export async function adjustedImpactScore({workspaceId,category,companyId,baseScore}){
  const pref=(await query('SELECT category_weights,entity_weights FROM intelligence_preferences WHERE workspace_id=$1',[workspaceId])).rows[0];
  const c=Number(pref?.category_weights?.[category]||0),e=Number(pref?.entity_weights?.[companyId]||0);
  return Math.max(0,Math.min(100,Math.round(Number(baseScore||50)+c*.35+e*.25)));
}
