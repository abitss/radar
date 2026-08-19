import { query } from './db.js';
import { aiText } from './ai.js';

export async function askRadar(workspaceId, question, useLiveWeb = true) {
  const [primary, companies, signals, briefings] = await Promise.all([
    query(`SELECT c.name,c.website,cp.* FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE c.workspace_id=$1 AND c.is_primary=true LIMIT 1`, [workspaceId]),
    query(`SELECT c.name,c.website,c.classification,cp.summary,r.similarity,r.threat,r.confidence,r.rationale,r.relationship_type FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id LEFT JOIN relationships r ON r.target_company_id=c.id AND r.workspace_id=c.workspace_id WHERE c.workspace_id=$1 LIMIT 40`, [workspaceId]),
    query(`SELECT s.title,s.summary,s.category,s.importance,s.confidence,s.impact,s.explanation,s.suggested_action,s.detected_at,c.name company FROM signals s JOIN companies c ON c.id=s.company_id WHERE s.workspace_id=$1 ORDER BY s.detected_at DESC LIMIT 60`, [workspaceId]),
    query(`SELECT title,content,created_at FROM briefings WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 5`, [workspaceId])
  ]);
  const prompt = `
You are Ask RADAR, a competitive-intelligence research analyst for ONE private workspace.
Answer the user's question using the stored workspace intelligence below. When live web access is enabled, research current public information if necessary.
Clearly distinguish stored evidence, current web evidence, and inference. Never invent facts. Be concise but decision-ready. End with a short "What to review next" section.

USER QUESTION: ${question}
PRIMARY COMPANY: ${JSON.stringify(primary.rows[0]||{})}
COMPANIES: ${JSON.stringify(companies.rows)}
RECENT SIGNALS: ${JSON.stringify(signals.rows)}
BRIEFINGS: ${JSON.stringify(briefings.rows)}
`;
  return aiText(prompt, { web: useLiveWeb, webMode: 'auto' });
}
