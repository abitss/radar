import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const required=['app/page.js','app/dashboard/page.js','app/api/onboarding/route.js','app/api/scan/route.js','app/api/cron/monitor/route.js','lib/intelligence.js','lib/monitor.js','lib/security.js','lib/ai.js','lib/schema.js','Dockerfile','vercel.json'];
for(const file of required){if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing required file: ${file}`)}
const serverFiles=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(full.endsWith('.js')&&!full.includes('/components/')&&!full.includes('/app/') || full.endsWith('/route.js'))serverFiles.push(full)}}
walk(path.join(root,'lib'));
for(const base of ['app/api']) if(fs.existsSync(path.join(root,base))) walk(path.join(root,base));
for(const file of [...new Set(serverFiles)]) execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
for(const key of ['DATABASE_URL','CRON_SECRET','AI_PROVIDER']) if(!env.includes(key+'='))throw new Error(`Missing env example ${key}`);
console.log(`RADAR static verification passed: ${required.length} invariants, ${new Set(serverFiles).size} server modules syntax-checked.`);
