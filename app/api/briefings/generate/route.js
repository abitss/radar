import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { generateBriefing } from '@/lib/intelligence';
import { rateLimit } from '@/lib/rateLimit';
export const maxDuration=120;
export async function POST(request){try{const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});await rateLimit(`briefing:${user.id}`,{limit:8,windowSeconds:3600});const workspace=await getWorkspaceForUser(user.id);if(!workspace)return NextResponse.json({error:'Workspace missing'},{status:400});const body=await request.json().catch(()=>({}));const period=['daily','weekly','monthly'].includes(body.period)?body.period:'weekly';const briefing=await generateBriefing(workspace.id,period);return NextResponse.json({ok:true,briefing});}catch(error){return NextResponse.json({error:error.message||'Briefing generation failed'},{status:500});}}
