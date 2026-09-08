import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { enqueueWorkspaceRefresh } from '@/lib/jobs';
import { rateLimit } from '@/lib/rateLimit';
export async function POST(){try{const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const workspace=await getWorkspaceForUser(user.id);if(!workspace)return NextResponse.json({error:'Workspace missing'},{status:400});const existing=(await query(`SELECT id,status FROM job_queue WHERE queue_name='workspace_refresh' AND payload->>'workspaceId'=$1 AND status IN ('queued','processing') ORDER BY id DESC LIMIT 1`,[String(workspace.id)])).rows[0];if(existing)return NextResponse.json({ok:true,alreadyQueued:true,jobId:existing.id,message:'RADAR refresh is already queued'});await rateLimit(`refresh:${user.id}`,{limit:12,windowSeconds:3600});const jobId=await enqueueWorkspaceRefresh(workspace.id);return NextResponse.json({ok:true,queued:true,jobId,message:'RADAR refresh queued'});}catch(error){return NextResponse.json({error:error.message},{status:500});}}
