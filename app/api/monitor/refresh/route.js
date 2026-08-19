import { NextResponse } from 'next/server';
import { getCurrentUser,getWorkspaceForUser } from '@/lib/auth';
import { runWorkspaceRefresh } from '@/lib/monitor';
import { runMarketResearch } from '@/lib/intelligence';
import { rateLimit } from '@/lib/rateLimit';
export const maxDuration=300;
export async function POST(){
  try{
    const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
    await rateLimit(`refresh:${user.id}`,{limit:8,windowSeconds:3600});
    const workspace=await getWorkspaceForUser(user.id);if(!workspace)return NextResponse.json({error:'Workspace missing'},{status:400});
    const sourceResult=await runWorkspaceRefresh(workspace.id);
    const webResult=await runMarketResearch(workspace.id).catch(error=>({events:0,themes:0,error:error.message}));
    return NextResponse.json({...sourceResult,liveWebSignals:webResult.events||0,liveWebError:webResult.error||null});
  }catch(error){return NextResponse.json({error:error.message},{status:500});}
}
