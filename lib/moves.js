import { query, transaction } from './db.js';
import { id } from './ids.js';
import { adjustedImpactScore } from './preferences.js';

const PATTERNS = [
  { type: 'ENTERPRISE_EXPANSION', title: 'Enterprise expansion appears to be forming', categories: ['hiring_signal','partnership','customer_announcement','pricing_change','packaging_change','new_geography','feature_added'], words: ['enterprise','salesforce','soc 2','soc2','fortune 500','vp sales','enterprise sales'] },
  { type: 'AI_PRODUCT_PUSH', title: 'AI product acceleration appears to be forming', categories: ['feature_added','product_launch','hiring_signal','technology_signal','partnership'], words: [' ai ','artificial intelligence','machine learning','agent','llm','copilot'] },
  { type: 'NEW_GEOGRAPHY', title: 'Geographic expansion appears to be forming', categories: ['new_geography','hiring_signal','partnership','customer_announcement'], words: ['launch in','expansion','country','region','local team','market entry'] },
  { type: 'PRICE_STRATEGY_SHIFT', title: 'Pricing strategy is shifting', categories: ['pricing_change','packaging_change','positioning_change'], words: ['price','pricing','free plan','tier','package','discount'] },
  { type: 'PRODUCT_EXPANSION', title: 'Product expansion is accelerating', categories: ['product_launch','feature_added','technology_signal','product_listing_change','partnership'], words: ['launch','new product','new feature','integration','platform'] },
  { type: 'GTM_ACCELERATION', title: 'Go-to-market acceleration appears to be forming', categories: ['hiring_signal','advertising_campaign','partnership','customer_announcement','positioning_change'], words: ['sales','marketing','campaign','partner','customer','go-to-market','gtm'] }
];

function evidenceWeight(signals, pattern) {
  const categoryHits = new Set(signals.filter(s => pattern.categories.includes(s.category)).map(s => s.category)).size;
  const text = signals.map(s => `${s.title} ${s.summary}`.toLowerCase()).join(' ');
  const wordHits = pattern.words.filter(w => text.includes(w.trim())).length;
  return { categoryHits, wordHits, score: categoryHits * 22 + wordHits * 9 };
}

export async function detectMovesForCompany(workspaceId, companyId) {
  const signals = (await query(`SELECT * FROM signals WHERE workspace_id=$1 AND company_id=$2 AND detected_at>now()-interval '45 days' ORDER BY detected_at DESC LIMIT 80`, [workspaceId, companyId])).rows;
  if (signals.length < 2) return { moves: 0 };
  let changed = 0;
  for (const pattern of PATTERNS) {
    const matching = signals.filter(s => pattern.categories.includes(s.category) || pattern.words.some(w => `${s.title} ${s.summary}`.toLowerCase().includes(w.trim()))).slice(0,12);
    const weights = evidenceWeight(matching, pattern);
    if (matching.length < 2 || weights.categoryHits < 2 || weights.score < 55) continue;
    const avgConfidence = Math.round(matching.reduce((a,s)=>a+Number(s.confidence||50),0)/matching.length);
    const avgImpact = Math.round(matching.reduce((a,s)=>a+Number(s.impact_score||s.importance||50),0)/matching.length);
    const baseImpact = Math.min(98, Math.round(avgImpact * .72 + weights.score * .28));
    const impact = await adjustedImpactScore({ workspaceId, category: pattern.type.toLowerCase(), companyId, baseScore: baseImpact });
    const confidence = Math.min(96, Math.round(avgConfidence * .72 + Math.min(100,weights.score) * .28));
    const company = (await query('SELECT name FROM companies WHERE id=$1 AND workspace_id=$2', [companyId,workspaceId])).rows[0];
    const rationale = `${matching.length} related signals across ${weights.categoryHits} independent signal categories are moving in the same strategic direction.`;
    const summary = `${company?.name || 'This company'} shows a clustered pattern consistent with ${pattern.title.toLowerCase()}. RADAR is combining weak signals rather than treating each event as an isolated alert.`;
    const status = confidence >= 85 && weights.categoryHits >= 3 ? 'probable' : 'watching';
    let move = (await query(`SELECT * FROM moves WHERE workspace_id=$1 AND company_id=$2 AND move_type=$3 AND status IN ('watching','probable','confirmed') ORDER BY updated_at DESC LIMIT 1`, [workspaceId,companyId,pattern.type])).rows[0];
    await transaction(async client => {
      if (!move) {
        const moveId = id('mov');
        await client.query(`INSERT INTO moves(id,workspace_id,company_id,move_type,title,summary,rationale,confidence,impact_score,status,recommended_action,last_evidence_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [moveId,workspaceId,companyId,pattern.type,pattern.title,summary,rationale,confidence,impact,status,'Review the supporting evidence, compare it with your current strategy, and increase monitoring around the strongest confirming indicators.',matching[0].detected_at]);
        move = { id: moveId };
      } else {
        await client.query(`UPDATE moves SET summary=$2,rationale=$3,confidence=$4,impact_score=$5,status=$6,last_evidence_at=$7,updated_at=now() WHERE id=$1`, [move.id,summary,rationale,confidence,impact,status,matching[0].detected_at]);
      }
      for (const signal of matching) await client.query('INSERT INTO move_signals(move_id,signal_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[move.id,signal.id]);
    });
    changed++;
  }
  return { moves: changed };
}

export async function getMoves(workspaceId, limit = 100) {
  const result = await query(`SELECT m.*,c.name company_name,c.website,(SELECT count(*)::int FROM move_signals ms WHERE ms.move_id=m.id) signal_count
    FROM moves m JOIN companies c ON c.id=m.company_id WHERE m.workspace_id=$1 AND m.status<>'dismissed' ORDER BY m.impact_score DESC,m.updated_at DESC LIMIT $2`, [workspaceId,limit]);
  return result.rows;
}
