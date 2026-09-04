import { spawn } from 'node:child_process';

const children=new Map();
let shuttingDown=false;

function start(name,command,args,extraEnv={}){
  const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...extraEnv}});
  children.set(name,child);
  console.log(`[RADAR supervisor] started ${name} pid=${child.pid}`);
  child.on('exit',(code,signal)=>{
    children.delete(name);
    console.error(`[RADAR supervisor] ${name} exited code=${code} signal=${signal||''}`);
    if(shuttingDown)return;
    if(name==='web')process.exit(code||1);
    setTimeout(()=>start('worker',process.execPath,['scripts/worker.mjs'],{RADAR_EMBEDDED_WORKER:'true'}),2000);
  });
  return child;
}

start('web',process.execPath,['node_modules/next/dist/bin/next','start']);
start('worker',process.execPath,['scripts/worker.mjs'],{RADAR_EMBEDDED_WORKER:'true'});

function stop(signal){if(shuttingDown)return;shuttingDown=true;console.log(`[RADAR supervisor] ${signal}, stopping services`);for(const child of children.values())child.kill(signal);setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',()=>stop('SIGTERM'));
process.on('SIGINT',()=>stop('SIGINT'));
