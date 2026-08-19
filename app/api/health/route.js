import { NextResponse } from 'next/server';
import { dbHealth } from '@/lib/db';
import { aiConfigured } from '@/lib/ai';
export async function GET(){const db=await dbHealth();const payload={ok:db.ok,service:'RADAR',database:db.ok?'connected':'error',ai:aiConfigured()?'configured':'missing',time:new Date().toISOString()};if(!db.ok&&process.env.NODE_ENV!=='production')payload.dbError=db.error;return NextResponse.json(payload,{status:db.ok?200:503});}
