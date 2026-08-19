'use client';
import {useEffect,useState} from 'react';
export default function LivePulse(){const [state,setState]=useState('syncing');useEffect(()=>{let alive=true;const ping=async()=>{try{const r=await fetch('/api/live',{cache:'no-store'});if(alive)setState(r.ok?'synced':'degraded')}catch{if(alive)setState('offline')}};ping();const t=setInterval(ping,20000);return()=>{alive=false;clearInterval(t)}},[]);return <div style={{display:'flex',alignItems:'center',gap:7,fontSize:11,color:'#8ea0b6'}}><span className="pulse"/> {state}</div>}
