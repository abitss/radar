import { query } from './db.js';

export async function dashboardData(workspaceId) {
  const [primary, signals, moves, candidates, companies, sources, scan, briefing, decisions, actions] = await Promise.all([
    query(`SELECT c.*,cp.* FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE c.workspace_id=$1 AND c.is_primary=true LIMIT 1`, [workspaceId]),
    query(`SELECT s.*,c.name company_name FROM signals s JOIN companies c ON c.id=s.company_id WHERE s.workspace_id=$1 ORDER BY s.impact_score DESC,s.detected_at DESC LIMIT 12`, [workspaceId]),
    query(`SELECT m.*,c.name company_name,c.website,(SELECT count(*)::int FROM move_signals ms WHERE ms.move_id=m.id) signal_count FROM moves m JOIN companies c ON c.id=m.company_id WHERE m.workspace_id=$1 AND m.status<>'dismissed' ORDER BY m.impact_score DESC,m.updated_at DESC LIMIT 6`, [workspaceId]),
    query(`SELECT r.*,c.name,c.website,c.classification,cp.summary FROM relationships r JOIN companies c ON c.id=r.target_company_id LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE r.workspace_id=$1 AND r.status='candidate' ORDER BY r.threat DESC,r.similarity DESC LIMIT 8`, [workspaceId]),
    query(`SELECT c.*,cp.summary,cp.industry,cp.pricing,cp.positioning,COALESCE(r.similarity,0) similarity,COALESCE(r.threat,0) threat,COALESCE(r.confidence,0) confidence FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id LEFT JOIN relationships r ON r.target_company_id=c.id AND r.workspace_id=c.workspace_id WHERE c.workspace_id=$1 ORDER BY c.is_primary DESC,r.threat DESC NULLS LAST,c.created_at DESC`, [workspaceId]),
    query(`SELECT * FROM sources WHERE workspace_id=$1 ORDER BY priority DESC,COALESCE(last_checked_at,created_at) DESC LIMIT 60`, [workspaceId]),
    query(`SELECT * FROM scans WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`, [workspaceId]),
    query(`SELECT * FROM briefings WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`, [workspaceId]),
    query(`SELECT count(*)::int count FROM decisions WHERE workspace_id=$1 AND status IN ('open','deferred')`,[workspaceId]),
    query(`SELECT count(*)::int count FROM actions WHERE workspace_id=$1 AND status IN ('draft','active')`,[workspaceId])
  ]);
  const high=signals.rows.filter(s=>Number(s.impact_score||s.importance)>=75).length;
  const healthy=sources.rows.filter(s=>s.health==='healthy').length;
  return {primary:primary.rows[0]||null,signals:signals.rows,moves:moves.rows,candidates:candidates.rows,companies:companies.rows,sources:sources.rows,scan:scan.rows[0]||null,briefing:briefing.rows[0]||null,stats:{highSignals:high,moves:moves.rows.length,competitors:Math.max(0,companies.rows.length-1),emerging:companies.rows.filter(c=>c.classification==='emerging_threat').length,sourceHealth:sources.rows.length?Math.round(healthy/sources.rows.length*100):0,openDecisions:decisions.rows[0]?.count||0,openActions:actions.rows[0]?.count||0}};
}

export async function getSignalEvidence(signalId, workspaceId) {return (await query('SELECT * FROM evidence WHERE signal_id=$1 AND workspace_id=$2 ORDER BY reliability DESC',[signalId,workspaceId])).rows;}
