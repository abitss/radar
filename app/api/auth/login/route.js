import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { rateLimit, requestIp } from '@/lib/rateLimit';
export async function POST(request){
  try{
    await rateLimit(`login:${requestIp(request)}`,{limit:12,windowSeconds:600});
    const body=await request.json();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    const user=(await query('SELECT * FROM users WHERE email=$1 LIMIT 1',[email])).rows[0];
    if(!user||!verifyPassword(password,user.password_hash)) return NextResponse.json({error:'Invalid email or password.'},{status:401});
    await query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    await createSession(user.id);
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error.message||'Login failed'},{status:500});}
}
