import { transaction, query } from './db.js';
import { id } from './ids.js';
import { crawlStartup, fetchSnapshot } from './crawl.js';
import { aiJson, aiText } from './ai.js';
import { clampScore, normalizeUrl, assertSafePublicUrl } from './security.js';
import { sendBriefingEmail, dispatchSignalAlerts } from './notify.js';

const PROFILE_PROMPT = (website, text) => `
You are RADAR, an evidence-first startup analyst. Analyze the company at ${website} using ONLY the supplied first-party website evidence. Unknown values must remain null or empty.

WEBSITE EVIDENCE:\n${text}

Return this JSON shape exactly:
{
  "name":"",
  "industry":"",
  "subcategory":"",
  "summary":"",
  "problem_use_case":"",
  "target_customers":[],
  "products":[],
  "features":[],
  "geography":[],
  "business_model":"",
  "pricing":"",
  "technologies":[],
  "positioning":"",
  "messaging":"",
  "public_facts":[],
  "confidence":0
}`;

const PROFILE_WEB_PROMPT = (website) => `
Research the startup/company at ${website} using current public web evidence. Build a cautious structured company profile. Prefer the company's own website and official profiles; use reputable secondary sources only to fill gaps. Unknown values must remain null or empty. Never invent facts.
Return JSON:
{
  "name":"",
  "industry":"",
  "subcategory":"",
  "summary":"",
  "problem_use_case":"",
  "target_customers":[],
  "products":[],
  "features":[],
  "geography":[],
  "business_model":"",
  "pricing":"",
  "technologies":[],
  "positioning":"",
  "messaging":"",
  "public_facts":[],
  "confidence":0,
  "evidence_urls":[]
}`;

const DISCOVERY_PROMPT = (profile, domain, workspaceContext = {}) => `
Research the current competitive landscape around this startup. You MUST search the live public web and ground company claims in sources.
Startup domain: ${domain}
Startup profile: ${JSON.stringify(profile)}
Workspace perspective: ${JSON.stringify(workspaceContext)}

Find the most strategically relevant companies, including obvious and non-obvious entrants. Classify each as direct, adjacent, substitute, emerging_threat, incumbent, or watchlist. Avoid duplicate companies and avoid the startup itself.
Score similarity and threat from 0-100. Expose components instead of unexplained scores.

Return JSON:
{
 "market_themes":[{"theme":"","why_it_matters":""}],
 "competitors":[{
   "name":"","website":"","classification":"direct|adjacent|substitute|emerging_threat|incumbent|watchlist",
   "summary":"","rationale":"","similarity":0,"threat":0,"confidence":0,
   "components":{"customer":0,"problem":0,"product":0,"features":0,"pricing":0,"geography":0,"business_model":0,"technology":0,"positioning":0,"distribution":0},
   "threat_components":{"momentum":0,"funding_resources":0,"hiring_velocity":0,"release_velocity":0,"geographic_expansion":0,"audience_traction":0,"partnerships":0,"strategic_relevance":0},
   "evidence_urls":[]
 }]
}`;


const MARKET_RESEARCH_PROMPT = ({primary, competitors, role, targetMarket, since, recent}) => `
You are RADAR's live market-research analyst. Search the current public web for MATERIAL competitive changes that occurred since ${since} around the user's startup and the companies it monitors.

USER STARTUP:
${JSON.stringify(primary)}

MONITORED COMPANIES:
${JSON.stringify(competitors)}

USER PERSPECTIVE: ${role || 'Founder'}
TARGET MARKET: ${targetMarket || 'Not specified'}

RECENT SIGNALS ALREADY STORED (do not duplicate these unless there is a genuinely new development):
${JSON.stringify(recent)}

Look for decision-useful events such as product launches, feature additions/removals, pricing/packaging changes, positioning/message shifts, strategic website changes, new geographies, partnerships, customer announcements, funding, M&A, leadership changes, hiring signals, technology/stack signals, patent/IP signals where accessible, regulatory/legal events, product listings/app-store changes, customer sentiment shifts, social/content strategy changes where permitted, advertising/campaign signals where permitted, accelerator participation and meaningful market themes.

Rules:
- Every event MUST have at least one real public evidence URL.
- Prefer primary/company sources plus reputable secondary sources when available.
- Separate FACT from INFERENCE.
- Do not report rumors as facts.
- Do not invent dates, amounts, customers, prices or features.
- Filter trivial news and repeated syndication.
- Return at most 15 high-value events.
- Only use companies in the monitored list for event objects. Unknown companies belong in competitor discovery, not this event list.

Return JSON exactly:
{
  "events":[{
    "company_name":"",
    "company_website":"",
    "category":"product_launch|feature_added|feature_removed|pricing_change|packaging_change|positioning_change|strategic_website_change|new_geography|partnership|customer_announcement|funding|m_and_a|leadership_change|hiring_signal|technology_signal|patent_ip_signal|regulatory_legal|advertising_campaign|customer_sentiment_shift|product_listing_change|social_content_strategy|accelerator_participation|other_market_event",
    "title":"",
    "summary":"",
    "event_at":"ISO-8601 date/time if supported by evidence, otherwise null",
    "importance":0,
    "confidence":0,
    "impact":"",
    "explanation":"",
    "suggested_action":"",
    "fact_or_inference":"fact|inference",
    "evidence_urls":[]
  }],
  "market_themes":[{"theme":"","why_it_matters":"","confidence":0,"evidence_urls":[]}]
}`;


const CLASSIFICATIONS = new Set(['direct','adjacent','substitute','emerging_threat','incumbent','watchlist']);
const asList = (value) => Array.isArray(value) ? value.map(v=>String(v).slice(0,300)).filter(Boolean).slice(0,60) : (value ? [String(value).slice(0,300)] : []);
const asClassification = (value) => CLASSIFICATIONS.has(String(value)) ? String(value) : 'watchlist';

function companyNameFromDomain(domain) {
  return domain.split('.')[0].replace(/[-_]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function urlMatchesDomain(rawUrl, domain) {
  try {
    const host = normalizeUrl(rawUrl).hostname.replace(/^www\./,'').toLowerCase();
    const expected = String(domain || '').replace(/^www\./,'').toLowerCase();
    return Boolean(host && expected && (host === expected || host.endsWith('.' + expected)));
  } catch {
    return false;
  }
}
async function updateScan(scanId, stage, progress, status = 'running', error = null) {
  await query(`UPDATE scans SET stage=$2,progress=$3,status=$4,started_at=COALESCE(started_at,now()),error=$5,completed_at=CASE WHEN $4 IN ('completed','failed') THEN now() ELSE completed_at END WHERE id=$1`, [scanId, stage, progress, status, error]);
}

export async function runInitialScan({ workspaceId, companyId, scanId }) {
  try {
    await updateScan(scanId, 'crawling_company', 8);
    const companyRes = await query('SELECT * FROM companies WHERE id=$1 AND workspace_id=$2', [companyId, workspaceId]);
    const company = companyRes.rows[0];
    if (!company) throw new Error('Company not found');
    let crawl = null;
    let crawlError = null;
    try { crawl = await crawlStartup(company.website); } catch (error) { crawlError = error; }

    await updateScan(scanId, 'understanding_company', 28);
    let profileResult;
    const directEvidenceEnough = crawl?.combinedText && crawl.combinedText.length >= 500;
    if (directEvidenceEnough) profileResult = await aiJson(PROFILE_PROMPT(company.website, crawl.combinedText));
    else profileResult = await aiJson(PROFILE_WEB_PROMPT(company.website), { web: true, webMode: 'required' });
    const p = profileResult.data;
    const resolvedDomain = crawl?.domain || company.domain || normalizeUrl(company.website).hostname.replace(/^www\./,'');
    const companyName = p.name || companyNameFromDomain(resolvedDomain);
    const profileEvidenceUrls = [...new Set([
      ...asList(p.evidence_urls),
      ...(profileResult.citations || []).map(c => c.url).filter(Boolean)
    ])];
    const verifiedFirstPartyEvidence = profileEvidenceUrls.filter(url => urlMatchesDomain(url, resolvedDomain));

    if (!directEvidenceEnough && verifiedFirstPartyEvidence.length === 0) {
      throw new Error('RADAR could not verify first-party public evidence for ' + resolvedDomain + '. Use the real public company website, check the URL, or retry when the site is reachable.');
    }

    await transaction(async (client) => {
      await client.query('UPDATE companies SET name=$1,domain=$2,updated_at=now() WHERE id=$3', [companyName, resolvedDomain, companyId]);
      await client.query(`INSERT INTO company_profiles (company_id,industry,subcategory,summary,problem_use_case,target_customers,products,features,geography,business_model,pricing,technologies,positioning,messaging,public_facts,confidence,source_count,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16,$17,now())
        ON CONFLICT(company_id) DO UPDATE SET industry=EXCLUDED.industry,subcategory=EXCLUDED.subcategory,summary=EXCLUDED.summary,problem_use_case=EXCLUDED.problem_use_case,target_customers=EXCLUDED.target_customers,products=EXCLUDED.products,features=EXCLUDED.features,geography=EXCLUDED.geography,business_model=EXCLUDED.business_model,pricing=EXCLUDED.pricing,technologies=EXCLUDED.technologies,positioning=EXCLUDED.positioning,messaging=EXCLUDED.messaging,public_facts=EXCLUDED.public_facts,confidence=EXCLUDED.confidence,source_count=EXCLUDED.source_count,updated_at=now()`,
        [companyId,p.industry||null,p.subcategory||null,p.summary||null,p.problem_use_case||null,JSON.stringify(asList(p.target_customers)),JSON.stringify(asList(p.products)),JSON.stringify(asList(p.features)),JSON.stringify(asList(p.geography)),p.business_model||null,p.pricing||null,JSON.stringify(asList(p.technologies)),p.positioning||null,p.messaging||null,JSON.stringify(asList(p.public_facts)),clampScore(p.confidence,70),crawl?.pages?.length || asList(p.evidence_urls).length || profileResult.citations?.length || 0]);
      for (const page of crawl?.pages || []) {
        await client.query(`INSERT INTO sources (id,workspace_id,company_id,url,title,source_type,reliability,check_frequency_minutes,status,health,next_check_at)
          VALUES ($1,$2,$3,$4,$5,$6,90,$7,'active','healthy',now()+interval '6 hours') ON CONFLICT(workspace_id,company_id,url) DO NOTHING`,
          [id('src'),workspaceId,companyId,page.url,page.title||page.url,sourceType(page.url),sourceType(page.url)==='pricing'?120:360]);
        await client.query(`INSERT INTO evidence (id,company_id,workspace_id,source_url,source_title,excerpt,reliability) SELECT $1,$2,$3,$4,$5,$6,90 WHERE NOT EXISTS (SELECT 1 FROM evidence WHERE company_id=$2 AND workspace_id=$3 AND source_url=$4 AND signal_id IS NULL)`, [id('evd'),companyId,workspaceId,page.url,page.title||page.url,page.text.slice(0,800)]);
        const snap = await fetchSnapshot(page.url).catch(() => null);
        if (snap) {
          const src = await client.query('SELECT id FROM sources WHERE workspace_id=$1 AND company_id=$2 AND url=$3', [workspaceId,companyId,page.url]);
          if (src.rows[0]) await client.query('INSERT INTO snapshots (id,source_id,content_hash,content_text,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [id('snp'),src.rows[0].id,snap.hash,snap.text,JSON.stringify({baseline:true,title:snap.title})]);
        }
      }
      for (const feedUrl of crawl?.feeds || []) {
        await client.query(`INSERT INTO sources (id,workspace_id,company_id,url,title,source_type,reliability,check_frequency_minutes,status,health,next_check_at) VALUES ($1,$2,$3,$4,$5,'rss',90,60,'active','healthy',now()) ON CONFLICT(workspace_id,company_id,url) DO NOTHING`, [id('src'),workspaceId,companyId,feedUrl,'RSS / Atom feed']);
      }
      if (!crawl?.pages?.length) {
        await client.query(`INSERT INTO sources (id,workspace_id,company_id,url,title,source_type,reliability,check_frequency_minutes,status,health,last_error,next_check_at) VALUES ($1,$2,$3,$4,$5,'website',80,360,'active','error',$6,now()+interval '60 minutes') ON CONFLICT(workspace_id,company_id,url) DO UPDATE SET health='error',last_error=EXCLUDED.last_error,next_check_at=EXCLUDED.next_check_at`, [id('src'),workspaceId,companyId,company.website,'Primary website',String(crawlError?.message || 'Direct crawl returned insufficient public text').slice(0,500)]);
      }
      const fallbackUrls = profileEvidenceUrls.filter(url => urlMatchesDomain(url, resolvedDomain)).slice(0,12);
      for (const url of fallbackUrls) {
        try {
          const safe = await assertSafePublicUrl(url);
          await client.query(`INSERT INTO evidence (id,company_id,workspace_id,source_url,source_title,excerpt,reliability) SELECT $1,$2,$3,$4,$5,$6,75 WHERE NOT EXISTS (SELECT 1 FROM evidence WHERE company_id=$2 AND workspace_id=$3 AND source_url=$4 AND signal_id IS NULL)`, [id('evd'),companyId,workspaceId,safe.toString(),companyName,p.summary||'Company-profile evidence']);
        } catch {}
      }
    });

    await updateScan(scanId, 'discovering_competitors', 52);
    const workspaceContext=(await query('SELECT role,target_market FROM workspaces WHERE id=$1',[workspaceId])).rows[0]||{};
    const discovery = await aiJson(DISCOVERY_PROMPT(p, resolvedDomain, workspaceContext), { web: true, webMode: 'required' });
    const d = discovery.data;

    await updateScan(scanId, 'scoring_market', 72);
    await persistDiscovery(workspaceId, companyId, d.competitors || [], discovery.citations || []);

    await updateScan(scanId, 'building_briefing', 88);
    await generateBriefing(workspaceId, 'initial', d.market_themes || []);

    await updateScan(scanId, 'completed', 100, 'completed');
    return { ok: true };
  } catch (error) {
    await updateScan(scanId, 'failed', 100, 'failed', error.message).catch(() => {});
    throw error;
  }
}

function sourceType(url) {
  const p = String(url).toLowerCase();
  if (p.includes('pricing')) return 'pricing';
  if (p.includes('career') || p.includes('/jobs')) return 'careers';
  if (p.includes('blog') || p.includes('news') || p.includes('press')) return 'news';
  if (p.includes('changelog') || p.includes('release')) return 'changelog';
  if (p.includes('product') || p.includes('feature')) return 'product';
  return 'website';
}

async function persistDiscovery(workspaceId, primaryId, competitors, citations) {
  for (const comp of competitors.slice(0, 18)) {
    if (!comp?.name) continue;
    let website = comp.website || '';
    try { if (website) website = normalizeUrl(website).toString(); } catch { website = ''; }
    const domain = website ? new URL(website).hostname.replace(/^www\./,'') : null;
    const existing = domain
      ? await query('SELECT id FROM companies WHERE workspace_id=$1 AND domain=$2 LIMIT 1', [workspaceId,domain])
      : await query('SELECT id FROM companies WHERE workspace_id=$1 AND lower(name)=lower($2) LIMIT 1', [workspaceId,String(comp.name).trim()]);
    const targetId = existing.rows[0]?.id || id('cmp');
    if (!existing.rows[0]) {
      await query(`INSERT INTO companies (id,workspace_id,name,domain,website,is_primary,classification,status) VALUES ($1,$2,$3,$4,$5,false,$6,'active')`, [targetId,workspaceId,String(comp.name).slice(0,180),domain,website||null,asClassification(comp.classification)]);
      await query(`INSERT INTO company_profiles (company_id,summary,confidence,source_count) VALUES ($1,$2,$3,$4) ON CONFLICT(company_id) DO NOTHING`, [targetId,comp.summary||null,clampScore(comp.confidence,60),asList(comp.evidence_urls).length]);
    }
    await query(`INSERT INTO relationships (id,workspace_id,source_company_id,target_company_id,relationship_type,status,similarity,threat,confidence,score_components,rationale,evidence_count)
      VALUES ($1,$2,$3,$4,$5,'candidate',$6,$7,$8,$9::jsonb,$10,$11)
      ON CONFLICT(workspace_id,source_company_id,target_company_id) DO UPDATE SET relationship_type=EXCLUDED.relationship_type,similarity=EXCLUDED.similarity,threat=EXCLUDED.threat,confidence=EXCLUDED.confidence,score_components=EXCLUDED.score_components,rationale=EXCLUDED.rationale,evidence_count=EXCLUDED.evidence_count,updated_at=now()`,
      [id('rel'),workspaceId,primaryId,targetId,asClassification(comp.classification),clampScore(comp.similarity),clampScore(comp.threat),clampScore(comp.confidence),JSON.stringify({similarity:comp.components||{},threat:comp.threat_components||{}}),comp.rationale||'',asList(comp.evidence_urls).length]);
    let urls = [...new Set(asList(comp.evidence_urls))].slice(0,8);
    if (!urls.length && domain) {
      urls = citations.map(c=>c.url).filter(url=>{ try { return new URL(url).hostname.replace(/^www\./,'').endsWith(domain); } catch { return false; } }).slice(0,4);
    }
    for (const url of urls) {
      if (!url) continue;
      await query(`INSERT INTO evidence (id,company_id,workspace_id,source_url,source_title,excerpt,reliability) VALUES ($1,$2,$3,$4,$5,$6,70)`, [id('evd'),targetId,workspaceId,url,comp.name,comp.rationale||'Discovery evidence']).catch(()=>{});
    }
  }
}

export async function approveCompetitor({ workspaceId, relationshipId, action, classification }) {
  const rel = await query('SELECT * FROM relationships WHERE id=$1 AND workspace_id=$2', [relationshipId,workspaceId]);
  if (!rel.rows[0]) throw new Error('Competitor relationship not found');
  if (action === 'approve') {
    const type = asClassification(classification || rel.rows[0].relationship_type);
    await query(`UPDATE relationships SET status='approved',relationship_type=$3,updated_at=now() WHERE id=$1 AND workspace_id=$2`, [relationshipId,workspaceId,type]);
    await query(`UPDATE companies SET classification=$2,approved_at=now(),updated_at=now() WHERE id=$1`, [rel.rows[0].target_company_id,type]);
    await discoverCompetitorSources(workspaceId, rel.rows[0].target_company_id);
  } else if (action === 'reject') {
    await query(`UPDATE relationships SET status='rejected',updated_at=now() WHERE id=$1 AND workspace_id=$2`, [relationshipId,workspaceId]);
  } else if (action === 'reclassify') {
    if (!classification) throw new Error('Classification required');
    const type = asClassification(classification);
    await query(`UPDATE relationships SET relationship_type=$3,updated_at=now() WHERE id=$1 AND workspace_id=$2`, [relationshipId,workspaceId,type]);
    await query(`UPDATE companies SET classification=$2,updated_at=now() WHERE id=$1`, [rel.rows[0].target_company_id,type]);
  } else {
    throw new Error('Invalid competitor action');
  }
}

export async function discoverCompetitorSources(workspaceId, companyId) {
  const comp = (await query('SELECT * FROM companies WHERE id=$1 AND workspace_id=$2', [companyId,workspaceId])).rows[0];
  if (!comp?.website) return;
  const crawl = await crawlStartup(comp.website, 5).catch(() => null);
  if (!crawl) return;
  try {
    const prof = (await aiJson(PROFILE_PROMPT(comp.website, crawl.combinedText))).data;
    await query(`INSERT INTO company_profiles (company_id,industry,subcategory,summary,problem_use_case,target_customers,products,features,geography,business_model,pricing,technologies,positioning,messaging,public_facts,confidence,source_count,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16,$17,now())
      ON CONFLICT(company_id) DO UPDATE SET industry=EXCLUDED.industry,subcategory=EXCLUDED.subcategory,summary=EXCLUDED.summary,problem_use_case=EXCLUDED.problem_use_case,target_customers=EXCLUDED.target_customers,products=EXCLUDED.products,features=EXCLUDED.features,geography=EXCLUDED.geography,business_model=EXCLUDED.business_model,pricing=EXCLUDED.pricing,technologies=EXCLUDED.technologies,positioning=EXCLUDED.positioning,messaging=EXCLUDED.messaging,public_facts=EXCLUDED.public_facts,confidence=EXCLUDED.confidence,source_count=EXCLUDED.source_count,updated_at=now()`,
      [companyId,prof.industry||null,prof.subcategory||null,prof.summary||null,prof.problem_use_case||null,JSON.stringify(asList(prof.target_customers)),JSON.stringify(asList(prof.products)),JSON.stringify(asList(prof.features)),JSON.stringify(asList(prof.geography)),prof.business_model||null,prof.pricing||null,JSON.stringify(asList(prof.technologies)),prof.positioning||null,prof.messaging||null,JSON.stringify(asList(prof.public_facts)),clampScore(prof.confidence,65),crawl.pages.length]);
  } catch {}
  for (const page of crawl.pages) {
    await query(`INSERT INTO sources (id,workspace_id,company_id,url,title,source_type,reliability,check_frequency_minutes,status,health,next_check_at)
      VALUES ($1,$2,$3,$4,$5,$6,85,$7,'active','healthy',now()) ON CONFLICT(workspace_id,company_id,url) DO NOTHING`,
      [id('src'),workspaceId,companyId,page.url,page.title||page.url,sourceType(page.url),sourceType(page.url)==='pricing'?120:360]);
    await query(`INSERT INTO evidence (id,company_id,workspace_id,source_url,source_title,excerpt,reliability) SELECT $1,$2,$3,$4,$5,$6,85 WHERE NOT EXISTS (SELECT 1 FROM evidence WHERE company_id=$2 AND workspace_id=$3 AND source_url=$4 AND signal_id IS NULL)`, [id('evd'),companyId,workspaceId,page.url,page.title||page.url,page.text.slice(0,800)]);
  }
  for (const feedUrl of crawl.feeds || []) await query(`INSERT INTO sources (id,workspace_id,company_id,url,title,source_type,reliability,check_frequency_minutes,status,health,next_check_at) VALUES ($1,$2,$3,$4,'RSS / Atom feed','rss',90,60,'active','healthy',now()) ON CONFLICT(workspace_id,company_id,url) DO NOTHING`, [id('src'),workspaceId,companyId,feedUrl]);
}

export async function generateBriefing(workspaceId, period='weekly', marketThemes=[]) {
  const signals = (await query(`SELECT s.title,s.summary,s.importance,s.confidence,s.impact,s.suggested_action,c.name company FROM signals s JOIN companies c ON c.id=s.company_id WHERE s.workspace_id=$1 ORDER BY s.detected_at DESC LIMIT 30`, [workspaceId])).rows;
  const candidates = (await query(`SELECT c.name,r.relationship_type,r.similarity,r.threat,r.rationale FROM relationships r JOIN companies c ON c.id=r.target_company_id WHERE r.workspace_id=$1 AND r.status='candidate' ORDER BY r.threat DESC LIMIT 10`, [workspaceId])).rows;
  const prompt = `Create a concise ${period} founder competitive intelligence briefing from ONLY this stored RADAR data. Separate facts from inference. Focus on what changed, why it matters, what deserves review next. IMPORTANT: candidate classifications, similarity scores, threat scores, rationales, and market themes are RADAR analytical outputs, not established facts. Never label them as established facts. A factual claim must be directly supported by stored signal data. If there are no signals, explicitly say this is baseline analysis and present rankings or strategic conclusions as inferences.\nSignals:${JSON.stringify(signals)}\nCandidates:${JSON.stringify(candidates)}\nThemes:${JSON.stringify(marketThemes)}`;
  let content;
  try { content = (await aiText(prompt)).text; }
  catch { content = `RADAR has ${signals.length} recent signals and ${candidates.length} new competitor candidates. Review the Today and Discover screens for evidence-backed details.`; }
  const title = period === 'initial' ? 'Your market baseline is ready' : `${period[0].toUpperCase()+period.slice(1)} market briefing`;
  const briefingId=id('brf');
  await query('INSERT INTO briefings (id,workspace_id,period,title,content,highlights) VALUES ($1,$2,$3,$4,$5,$6::jsonb)', [briefingId,workspaceId,period,title,content,JSON.stringify(signals.slice(0,5))]);
  if (period==='weekly' || period==='daily') await sendBriefingEmail(workspaceId,{id:briefingId,title,content}).catch(()=>{});
  return { id: briefingId, workspace_id: workspaceId, period, title, content };
}


function signalTokens(text) {
  return new Set(String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3));
}
function signalOverlap(a,b){const A=signalTokens(a),B=signalTokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(1,Math.min(A.size,B.size));}
function safeEventDate(value){if(!value)return new Date();const d=new Date(value);return Number.isFinite(d.getTime())?d:new Date();}
async function evidenceUrl(url){try{return (await assertSafePublicUrl(url)).toString()}catch{return null}}

export async function runMarketResearch(workspaceId) {
  const primary = (await query(`SELECT c.id,c.name,c.website,c.domain,cp.summary,cp.industry,cp.subcategory,cp.products,cp.pricing,cp.positioning,cp.target_customers,cp.geography FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE c.workspace_id=$1 AND c.is_primary=true LIMIT 1`,[workspaceId])).rows[0];
  if (!primary) return {events:0,themes:0};
  const workspace = (await query('SELECT role,target_market FROM workspaces WHERE id=$1',[workspaceId])).rows[0] || {};
  const competitors = (await query(`SELECT c.id,c.name,c.website,c.domain,c.classification,cp.summary,cp.pricing,cp.positioning,r.similarity,r.threat FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id LEFT JOIN relationships r ON r.target_company_id=c.id AND r.workspace_id=c.workspace_id WHERE c.workspace_id=$1 AND c.is_primary=false AND (r.status='approved' OR c.approved_at IS NOT NULL) ORDER BY COALESCE(r.threat,0) DESC LIMIT 20`,[workspaceId])).rows;
  if (!competitors.length) return {events:0,themes:0};
  const latestRun=(await query(`SELECT created_at FROM scans WHERE workspace_id=$1 AND scan_type='market_research' AND status='completed' ORDER BY created_at DESC LIMIT 1`,[workspaceId])).rows[0];
  const since = latestRun?.created_at ? new Date(latestRun.created_at).toISOString() : new Date(Date.now()-7*86400000).toISOString();
  const recent=(await query(`SELECT c.name company,s.category,s.title,s.summary,s.detected_at FROM signals s JOIN companies c ON c.id=s.company_id WHERE s.workspace_id=$1 AND s.detected_at>now()-interval '14 days' ORDER BY s.detected_at DESC LIMIT 50`,[workspaceId])).rows;
  const scanId=id('scn');
  await query(`INSERT INTO scans (id,workspace_id,company_id,scan_type,status,stage,progress,started_at) VALUES ($1,$2,$3,'market_research','running','researching_live_web',25,now())`,[scanId,workspaceId,primary.id]);
  try {
    const result=await aiJson(MARKET_RESEARCH_PROMPT({primary,competitors,role:workspace.role,targetMarket:workspace.target_market,since,recent}),{web:true,webMode:'required'});
    const events=Array.isArray(result.data?.events)?result.data.events:[];
    const known=new Map();
    for(const c of competitors){known.set(String(c.name).trim().toLowerCase(),c);if(c.domain)known.set(c.domain.replace(/^www\./,''),c);if(c.website){try{known.set(new URL(c.website).hostname.replace(/^www\./,''),c)}catch{}}}
    let stored=0;
    for(const event of events.slice(0,15)){
      let company=known.get(String(event.company_name||'').trim().toLowerCase());
      if(!company&&event.company_website){try{company=known.get(new URL(normalizeUrl(event.company_website)).hostname.replace(/^www\./,''))}catch{}}
      if(!company||!event.title||!event.summary)continue;
      const urls=[];for(const raw of asList(event.evidence_urls).slice(0,8)){const safe=await evidenceUrl(raw);if(safe&&!urls.includes(safe))urls.push(safe)}
      if(!urls.length)continue;
      const recentSame=(await query(`SELECT id,title,summary,category FROM signals WHERE workspace_id=$1 AND company_id=$2 AND detected_at>now()-interval '14 days' ORDER BY detected_at DESC LIMIT 40`,[workspaceId,company.id])).rows;
      const category=String(event.category||'other_market_event').slice(0,80);
      const duplicate=recentSame.find(x=>x.category===category&&Math.max(signalOverlap(x.title,event.title),signalOverlap(x.summary,event.summary))>=0.58);
      if(duplicate){for(const url of urls)await query(`INSERT INTO evidence (id,signal_id,company_id,workspace_id,source_url,source_title,excerpt,reliability) SELECT $1,$2,$3,$4,$5,$6,$7,75 WHERE NOT EXISTS (SELECT 1 FROM evidence WHERE signal_id=$2 AND source_url=$5)`,[id('evd'),duplicate.id,company.id,workspaceId,url,event.company_name||company.name,String(event.summary).slice(0,1200)]).catch(()=>{});continue;}
      const signalId=id('sig');
      await query(`INSERT INTO signals (id,workspace_id,company_id,category,title,summary,importance,confidence,impact,explanation,suggested_action,fact_or_inference,event_at,detected_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,[signalId,workspaceId,company.id,category,String(event.title).slice(0,240),String(event.summary).slice(0,3000),clampScore(event.importance,60),clampScore(event.confidence,70),event.impact?String(event.impact).slice(0,1600):null,event.explanation?String(event.explanation).slice(0,2400):null,event.suggested_action?String(event.suggested_action).slice(0,1600):null,event.fact_or_inference==='inference'?'inference':'fact',safeEventDate(event.event_at)]);
      for(const url of urls)await query(`INSERT INTO evidence (id,signal_id,company_id,workspace_id,source_url,source_title,excerpt,reliability) VALUES ($1,$2,$3,$4,$5,$6,$7,75)`,[id('evd'),signalId,company.id,workspaceId,url,event.company_name||company.name,String(event.summary).slice(0,1200)]).catch(()=>{});
      await dispatchSignalAlerts(signalId).catch(()=>{});stored++;
    }
    await query(`UPDATE scans SET status='completed',stage='completed',progress=100,completed_at=now() WHERE id=$1`,[scanId]);
    return {events:stored,themes:Array.isArray(result.data?.market_themes)?result.data.market_themes.length:0};
  } catch(error) {
    await query(`UPDATE scans SET status='failed',stage='failed',progress=100,error=$2,completed_at=now() WHERE id=$1`,[scanId,String(error.message||error).slice(0,500)]).catch(()=>{});
    throw error;
  }
}

export async function refreshDiscovery(workspaceId) {
  const primary = (await query(`SELECT c.id,c.domain,c.website,c.name,cp.* FROM companies c LEFT JOIN company_profiles cp ON cp.company_id=c.id WHERE c.workspace_id=$1 AND c.is_primary=true LIMIT 1`, [workspaceId])).rows[0];
  if (!primary) return { added: 0 };
  const scanId = id('scn');
  await query(`INSERT INTO scans (id,workspace_id,company_id,scan_type,status,stage,progress,started_at) VALUES ($1,$2,$3,'discovery','running','discovering_competitors',50,now())`, [scanId, workspaceId, primary.id]);
  try {
    const profile = { industry: primary.industry, subcategory: primary.subcategory, summary: primary.summary, problem_use_case: primary.problem_use_case, target_customers: primary.target_customers, products: primary.products, features: primary.features, geography: primary.geography, business_model: primary.business_model, pricing: primary.pricing, technologies: primary.technologies, positioning: primary.positioning, messaging: primary.messaging };
    const workspaceContext=(await query('SELECT role,target_market FROM workspaces WHERE id=$1',[workspaceId])).rows[0]||{};
    const discovery = await aiJson(DISCOVERY_PROMPT(profile, primary.domain || primary.website, workspaceContext), { web: true, webMode: 'required' });
    await persistDiscovery(workspaceId, primary.id, discovery.data.competitors || [], discovery.citations || []);
    await query(`UPDATE scans SET status='completed',stage='completed',progress=100,completed_at=now() WHERE id=$1`, [scanId]);
    return { added: (discovery.data.competitors || []).length };
  } catch (error) {
    await query(`UPDATE scans SET status='failed',stage='failed',progress=100,error=$2,completed_at=now() WHERE id=$1`, [scanId, error.message.slice(0,500)]).catch(()=>{});
    throw error;
  }
}
