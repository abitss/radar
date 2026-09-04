import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { enqueueWorkspaceRefresh } from '@/lib/jobs';
import { rateLimit } from '@/lib/rateLimit';
export async function POST(){try{const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});await rateLimit(`refresh:${user.id}`,{limit:12,windowSeconds:3600});const workspace=await getWorkspaceForUser(user.id);if(!workspace)return NextResponse.json({error:'Workspace missing'},{status:400});const jobId=await enqueueWorkspaceRefresh(workspace.id);return NextResponse.json({ok:true,queued:true,jobId,message:'RADAR refresh queued'});}catch(error){return NextResponse.json({error:error.message},{status:500});}}
