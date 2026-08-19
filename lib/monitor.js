import { query } from './db.js';
import { id } from './ids.js';
import { fetchSnapshot } from './crawl.js';
import { aiJson } from './ai.js';
import { clampScore } from './security.js';
import { dispatchSignalAlerts } from './notify.js';
import { generateBriefing, refreshDiscovery, runMarketResearch } from './intelligence.js';

const CHANGE_PROMPT = (company, source, previous, current, context) => `
You are RADAR's semantic change detector. Compare OLD vs NEW source content for ${company}.
Ignore cosmetic/layout changes, cookie banners, timestamps, copyright years, navigation reorder, repeated boilerplate and other non-strategic noise.
Only mark meaningful=true for a competitively useful event such as product/feature/pricing/positioning/geography/partnership/customer/funding/M&A/leadership/hiring/technology/patent/regulatory/listing/sentiment/advertising/content-strategy changes.

USER CONTEXT: ${JSON.stringify(context)}
SOURCE: ${source}
OLD:\n${previous.slice(0,22000)}
NEW:\n${current.slice(0,22000)}

Return JSON:
{
 "meaningful":false,
 "category":"strategic_website_change",
 "title":"",
 "summary":"",
 "previous_state":"",
 "new_state":"",
 "importance":0,
 "confidence":0,
 "impact":"",
 "explanation":"",
 "suggested_action":"",
 "fact_or_inference":"fact"
}`;


function tokens(text) {
  return new Set(String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3));
}
function overlap(a,b){ const A=tokens(a), B=tokens(b); if(!A.size||!B.size)return 0; let both=0; for(const x of A)if(B.has(x))both++; return both / Math.max(1, Math.min(A.size,B.size)); }
async function findDuplicateSignal(workspaceId, companyId, change){
  const recent=(await query(`SELECT id,title,summary,category FROM signals WHERE workspace_id=$1 AND company_id=$2 AND detected_at>now()-interval '48 hours' ORDER BY detected_at DESC LIMIT 25`,[workspaceId,companyId])).rows;
  return recent.find(s => s.category===(change.category||'strategic_website_change') && Math.max(overlap(s.title,change.title),overlap(s.summary,change.summary))>=0.58) || null;
}

export async function runMonitoringBatch(limit = Number(process.env.MONITOR_BATCH_SIZE || 20), workspaceId = null) {
  const due = (await query(`
    SELECT s.*,c.name company_name FROM sources s JOIN companies c ON c.id=s.company_id
    WHERE s.status='active' AND (s.next_check_at IS NULL OR s.next_check_at<=now()) AND ($2::text IS NULL OR s.workspace_id=$2)
    ORDER BY COALESCE(s.next_check_at,s.created_at) ASC LIMIT $1`, [limit,workspaceId])).rows;
  const result = { checked: 0, changed: 0, signals: 0, failed: 0 };
  for (const source of due) {
    result.checked++;
    try {
      const snap = await fetchSnapshot(source.url);
      const previous = (await query('SELECT * FROM snapshots WHERE source_id=$1 ORDER BY fetched_at DESC LIMIT 1', [source.id])).rows[0];
      await query('INSERT INTO snapshots (id,source_id,content_hash,content_text,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [id('snp'),source.id,snap.hash,snap.text,JSON.stringify({title:snap.title})]);
      await query(`UPDATE sources SET health='healthy',last_checked_at=now(),last_success_at=now(),last_error=NULL,next_check_at=now()+($2 || ' minutes')::interval WHERE id=$1`, [source.id,String(source.check_frequency_minutes)]);
      if (!previous || previous.content_hash === snap.hash) continue;
      result.changed++;
      const context = (await query(`SELECT w.role,w.target_market,c.name primary_name,cp.summary,cp.positioning,cp.pricing,cp.target_customers,cp.products,cp.geography FROM workspaces w JOIN companies c ON c.workspace_id=w.id AND c.is_primary=true LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE w.id=$1 LIMIT 1`, [source.workspace_id])).rows[0] || {};
      const ai = await aiJson(CHANGE_PROMPT(source.company_name, source.url, previous.content_text, snap.text, context));
      const change = ai.data;
      if (!change.meaningful) continue;
      const duplicate = await findDuplicateSignal(source.workspace_id, source.company_id, change);
      if (duplicate) {
        await query('INSERT INTO evidence (id,signal_id,company_id,workspace_id,source_url,source_title,excerpt,reliability) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id('evd'),duplicate.id,source.company_id,source.workspace_id,source.url,source.title,change.new_state||change.summary||'',source.reliability]);
        continue;
      }
      const signalId = id('sig');
      await query(`INSERT INTO signals (id,workspace_id,company_id,category,title,summary,previous_state,new_state,importance,confidence,impact,explanation,suggested_action,fact_or_inference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [signalId,source.workspace_id,source.company_id,change.category||'strategic_website_change',change.title||'Meaningful market change detected',change.summary||'',change.previous_state||null,change.new_state||null,clampScore(change.importance,60),clampScore(change.confidence,70),change.impact||null,change.explanation||null,change.suggested_action||null,change.fact_or_inference==='inference'?'inference':'fact']);
      await query('INSERT INTO evidence (id,signal_id,company_id,workspace_id,source_url,source_title,excerpt,reliability) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id('evd'),signalId,source.company_id,source.workspace_id,source.url,source.title,change.new_state||change.summary||'',source.reliability]);
      await dispatchSignalAlerts(signalId).catch(()=>{});
      result.signals++;
    } catch (error) {
      result.failed++;
      await query(`UPDATE sources SET health='error',last_checked_at=now(),last_error=$2,next_check_at=now()+interval '60 minutes' WHERE id=$1`, [source.id,error.message.slice(0,500)]).catch(()=>{});
    }
  }
  return result;
}

export async function runWorkspaceRefresh(workspaceId) {
  const sources = (await query(`SELECT s.*,c.name company_name FROM sources s JOIN companies c ON c.id=s.company_id WHERE s.workspace_id=$1 AND s.status='active' ORDER BY COALESCE(s.last_checked_at,s.created_at) ASC LIMIT 12`, [workspaceId])).rows;
  const result = { checked: 0, changed: 0, signals: 0, failed: 0 };
  for (const source of sources) {
    await query('UPDATE sources SET next_check_at=now() WHERE id=$1', [source.id]);
  }
  const global = await runMonitoringBatch(Math.max(12, sources.length), workspaceId);
  Object.assign(result, global);
  return result;
}

export async function maintenanceJobs() {
  const monitoring = await runMonitoringBatch();
  const workspaces = (await query(`SELECT id FROM workspaces ORDER BY updated_at DESC LIMIT 30`)).rows;
  let discoveries = 0;
  let liveResearchSignals = 0;
  const researchIntervalMinutes = Math.max(30, Number(process.env.MARKET_RESEARCH_INTERVAL_MINUTES || 240));
  let researchRuns = 0;
  const researchRunLimit = Math.max(1, Number(process.env.MARKET_RESEARCH_WORKSPACE_LIMIT || 4));
  for (const workspace of workspaces) {
    const lastDaily = (await query(`SELECT created_at FROM briefings WHERE workspace_id=$1 AND period='daily' ORDER BY created_at DESC LIMIT 1`, [workspace.id])).rows[0];
    if (!lastDaily || Date.now() - new Date(lastDaily.created_at).getTime() > 20 * 3600 * 1000) {
      await generateBriefing(workspace.id, 'daily').catch(()=>{});
    }
    const last = (await query(`SELECT created_at FROM briefings WHERE workspace_id=$1 AND period='weekly' ORDER BY created_at DESC LIMIT 1`, [workspace.id])).rows[0];
    if (!last || Date.now() - new Date(last.created_at).getTime() > 6.5 * 24 * 3600 * 1000) {
      await generateBriefing(workspace.id, 'weekly').catch(()=>{});
    }
    const lastDiscovery = (await query(`SELECT created_at FROM scans WHERE workspace_id=$1 AND scan_type='discovery' ORDER BY created_at DESC LIMIT 1`, [workspace.id])).rows[0];
    if (!lastDiscovery || Date.now() - new Date(lastDiscovery.created_at).getTime() > 12 * 3600 * 1000) {
      const d = await refreshDiscovery(workspace.id).catch(()=>null);
      if (d) discoveries += d.added || 0;
    }
    const lastResearch = (await query(`SELECT created_at FROM scans WHERE workspace_id=$1 AND scan_type='market_research' AND status='completed' ORDER BY created_at DESC LIMIT 1`, [workspace.id])).rows[0];
    if (researchRuns < researchRunLimit && (!lastResearch || Date.now() - new Date(lastResearch.created_at).getTime() > researchIntervalMinutes * 60 * 1000)) {
      const r = await runMarketResearch(workspace.id).catch(()=>null);
      if (r) { liveResearchSignals += r.events || 0; researchRuns++; }
    }
  }
  const retentionDays = Math.max(7, Number(process.env.SNAPSHOT_RETENTION_DAYS || 180));
  const retention = await query(`DELETE FROM snapshots WHERE fetched_at < now() - ($1 || ' days')::interval`, [String(retentionDays)]).catch(()=>({rowCount:0}));
  await query(`DELETE FROM sessions WHERE expires_at < now()`).catch(()=>{});
  return { monitoring, workspacesConsidered: workspaces.length, discoveryCandidatesReviewed: discoveries, liveResearchSignals, snapshotsPruned: retention.rowCount || 0 };
}
