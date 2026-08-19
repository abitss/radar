import { requireWorkspace } from '@/lib/auth';
import { query } from '@/lib/db';
import EmptyState from '@/components/EmptyState';

export default async function EvidencePage({searchParams}){
  const {workspace}=await requireWorkspace();
  const p=await searchParams;
  let rows=[]; let heading='Evidence vault';
  if(p.signal){
    const sig=(await query('SELECT title FROM signals WHERE id=$1 AND workspace_id=$2',[p.signal,workspace.id])).rows[0];
    heading=sig?.title||heading;
    rows=(await query('SELECT * FROM evidence WHERE signal_id=$1 AND workspace_id=$2 ORDER BY reliability DESC,retrieved_at DESC',[p.signal,workspace.id])).rows;
  }else if(p.company){
    const comp=(await query('SELECT name FROM companies WHERE id=$1 AND workspace_id=$2',[p.company,workspace.id])).rows[0];
    heading=comp?`${comp.name} evidence`:heading;
    rows=(await query('SELECT * FROM evidence WHERE company_id=$1 AND workspace_id=$2 ORDER BY reliability DESC,retrieved_at DESC LIMIT 100',[p.company,workspace.id])).rows;
  }
  return <main className="content"><div className="eyebrow">EVIDENCE</div><h1 className="page-title">{heading}</h1><p className="sub">Inspect the public sources supporting RADAR’s facts and inferences. Evidence stays separate from private workspace context.</p><div className="grid grid-2" style={{marginTop:24}}>{rows.length?rows.map(e=><article className="card" key={e.id}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><span className="badge cyan">Reliability {e.reliability}</span><span className="muted" style={{fontSize:10}}>{new Date(e.retrieved_at).toLocaleString()}</span></div><h2 style={{fontSize:15,margin:'12px 0 7px'}}>{e.source_title||'Public source'}</h2><p className="muted" style={{fontSize:12,lineHeight:1.6}}>{e.excerpt||'Source captured as supporting evidence.'}</p><a className="button ghost" style={{display:'inline-block',marginTop:10}} href={e.source_url} target="_blank" rel="noreferrer">Open source ↗</a></article>):<EmptyState title="No evidence found" body="RADAR will attach source evidence as it researches and detects meaningful events."/>}</div></main>
}
