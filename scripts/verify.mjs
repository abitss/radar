import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const required=['app/page.js','app/dashboard/page.js','app/dashboard/moves/page.js','app/dashboard/watch/page.js','app/dashboard/decisions/page.js','app/dashboard/actions/page.js','app/dashboard/system/page.js','app/api/onboarding/route.js','app/api/scan/route.js','app/api/decisions/route.js','app/api/outcomes/route.js','app/api/system/status/route.js','lib/intelligence.js','lib/monitor.js','lib/moves.js','lib/watchGraph.js','lib/decisions.js','lib/preferences.js','lib/queue.js','lib/jobs.js','lib/billing.js','lib/security.js','lib/ai.js','lib/schemaUltimate.js','scripts/worker.mjs','scripts/start-all.mjs','Dockerfile','render.yaml'];
for(const file of required)if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing required file: ${file}`);
const serverFiles=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(full.endsWith('.js')||full.endsWith('.mjs'))serverFiles.push(full)}}
for(const base of ['lib','app/api','scripts'])if(fs.existsSync(path.join(root,base)))walk(path.join(root,base));
for(const file of [...new Set(serverFiles)])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');for(const key of ['DATABASE_URL','DATABASE_SSL_REJECT_UNAUTHORIZED','AI_PROVIDER','GEMINI_API_KEY','AI_MODEL_FAST','AI_MODEL_STANDARD','AI_MODEL_REASONING','WORKER_IDLE_MS'])if(!env.includes(key+'='))throw new Error(`Missing env example ${key}`);
const upgrade=fs.readFileSync(path.join(root,'lib/schemaUltimate.js'),'utf8');for(const invariant of ['CREATE TABLE IF NOT EXISTS moves','CREATE TABLE IF NOT EXISTS watch_targets','CREATE TABLE IF NOT EXISTS decisions','CREATE TABLE IF NOT EXISTS actions','CREATE TABLE IF NOT EXISTS outcomes','CREATE TABLE IF NOT EXISTS intelligence_preferences','CREATE TABLE IF NOT EXISTS job_queue','CREATE TABLE IF NOT EXISTS service_heartbeats','CREATE TABLE IF NOT EXISTS ai_runs'])if(!upgrade.includes(invariant))throw new Error(`Ultimate schema invariant missing: ${invariant}`);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg.scripts?.start!=='node scripts/start-all.mjs')throw new Error('Production start must supervise web + worker');
console.log(`RADAR Ultimate verification passed: ${required.length} launch artifacts, ${new Set(serverFiles).size} server modules syntax-checked.`);
