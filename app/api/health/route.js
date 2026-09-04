import { NextResponse } from 'next/server';
import { dbHealth } from '@/lib/db';
import { aiConfigured } from '@/lib/ai';
import { query } from '@/lib/db';
export async function GET(){const db=await dbHealth();let worker='starting';if(db.ok){try{const hb=(await query(`SELECT status,last_seen_at FROM service_heartbeats WHERE service='radar-worker' LIMIT 1`)).rows[0];if(hb){const age=Date.now()-new Date(hb.last_seen_at).getTime();worker=age<90000?hb.status:'stale'}}catch{}}const payload={ok:db.ok,service:'RADAR',database:db.ok?'connected':'error',ai:aiConfigured()?'configured':'missing',worker,time:new Date().toISOString()};return NextResponse.json(payload,{status:db.ok?200:503});}
