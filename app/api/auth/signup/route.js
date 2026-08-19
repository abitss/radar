import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { id } from '@/lib/ids';
import { hashPassword, createSession } from '@/lib/auth';
import { rateLimit, requestIp } from '@/lib/rateLimit';

export async function POST(request){
  try{
    await rateLimit(`signup:${requestIp(request)}`,{limit:8,windowSeconds:900});
    const body=await request.json();
    const name=String(body.name||'').trim().slice(0,120);
    const email=String(body.email||'').trim().toLowerCase().slice(0,240);
    const password=String(body.password||'');
    if(name.length<2) return NextResponse.json({error:'Please enter your name.'},{status:400});
    if(!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({error:'Please enter a valid email.'},{status:400});
    if(password.length<8) return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
    const userId=id('usr');
    try{await query('INSERT INTO users (id,email,password_hash,name) VALUES ($1,$2,$3,$4)',[userId,email,hashPassword(password),name]);}
    catch(error){if(error.code==='23505')return NextResponse.json({error:'An account with that email already exists.'},{status:409});throw error;}
    await createSession(userId);
    return NextResponse.json({ok:true,userId});
  }catch(error){return NextResponse.json({error:error.message||'Signup failed'},{status:500});}
}
