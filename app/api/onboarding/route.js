import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { transaction } from '@/lib/db';
import { id } from '@/lib/ids';
import { normalizeUrl, assertSafePublicUrl } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { enqueueInitialScan } from '@/lib/jobs';
import { ensureFreeSubscription } from '@/lib/billing';

export async function POST(request){
  try{
    const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
    await rateLimit(`onboarding:${user.id}`,{limit:4,windowSeconds:3600});
    if(await getWorkspaceForUser(user.id))return NextResponse.json({error:'Workspace already exists'},{status:409});
    const body=await request.json();const safe=await assertSafePublicUrl(body.website);const url=normalizeUrl(safe.toString());const domain=url.hostname.replace(/^www\./,'');const provisional=domain.split('.')[0].replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());const role=String(body.role||'Founder').slice(0,40);const targetMarket=String(body.targetMarket||'').trim().slice(0,240)||null;const workspaceId=id('wsp'),companyId=id('cmp'),scanId=id('scn');
    await transaction(async client=>{await client.query('INSERT INTO workspaces (id,name,role,target_market) VALUES ($1,$2,$3,$4)',[workspaceId,provisional,role,targetMarket]);await client.query('INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,$3)',[workspaceId,user.id,'owner']);await client.query(`INSERT INTO companies (id,workspace_id,name,domain,website,is_primary,classification,status) VALUES ($1,$2,$3,$4,$5,true,'self','active')`,[companyId,workspaceId,provisional,domain,url.toString()]);await client.query(`INSERT INTO scans (id,workspace_id,company_id,scan_type,status,stage,progress) VALUES ($1,$2,$3,'initial','queued','queued',0)`,[scanId,workspaceId,companyId]);await client.query(`INSERT INTO alert_rules (id,workspace_id,name,min_importance,categories,channels) VALUES ($1,$2,'Founder critical intelligence',80,'[]'::jsonb,'["in_app"]'::jsonb)`,[id('alr'),workspaceId])});
    await ensureFreeSubscription(workspaceId);await enqueueInitialScan({workspaceId,companyId,scanId});
    return NextResponse.json({ok:true,workspaceId,companyId,scanId,queued:true});
  }catch(error){return NextResponse.json({error:error.message||'Onboarding failed'},{status:400});}
}
