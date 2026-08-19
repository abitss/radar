import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { runInitialScan } from '@/lib/intelligence';
import { rateLimit } from '@/lib/rateLimit';
export const maxDuration=300;
export async function POST(request){
  try{
    const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
    await rateLimit(`scan:${user.id}`,{limit:6,windowSeconds:3600});
    const workspace=await getWorkspaceForUser(user.id);if(!workspace)return NextResponse.json({error:'Workspace missing'},{status:400});
    const {scanId}=await request.json();
    const scan=(await query('SELECT * FROM scans WHERE id=$1 AND workspace_id=$2 LIMIT 1',[scanId,workspace.id])).rows[0];
    if(!scan)return NextResponse.json({error:'Scan not found'},{status:404});
    if(scan.status==='completed')return NextResponse.json({ok:true,alreadyComplete:true});
    await runInitialScan({workspaceId:workspace.id,companyId:scan.company_id,scanId:scan.id});
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error.message||'Scan failed'},{status:500});}
}
