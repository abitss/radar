import { NextResponse } from 'next/server';
import { maintenanceJobs } from '@/lib/monitor';
export const maxDuration=300;
function authorized(request){const secret=process.env.CRON_SECRET;if(!secret)return false;return request.headers.get('authorization')===`Bearer ${secret}`;}
export async function GET(request){if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({ok:true,...await maintenanceJobs(),ranAt:new Date().toISOString()});}catch(error){console.error('[RADAR cron] maintenance failed',error);return NextResponse.json({error:'Maintenance run failed'},{status:500});}}
export const POST=GET;
