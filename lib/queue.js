import { query, transaction } from './db.js';

export const QUEUES=Object.freeze({initialScan:'initial_scan',workspaceRefresh:'workspace_refresh',marketResearch:'market_research',discovery:'discovery',briefings:'briefings'});

export async function enqueue(queueName,payload,{priority=50,delaySeconds=0,maxAttempts=4}={}){
  const result=await query(`INSERT INTO job_queue(queue_name,payload,priority,max_attempts,available_at) VALUES($1,$2::jsonb,$3,$4,now()+($5::text||' seconds')::interval) RETURNING id`,[queueName,JSON.stringify(payload),Math.max(0,Math.min(100,Number(priority)||50)),Math.max(1,Math.min(12,Number(maxAttempts)||4)),String(Math.max(0,Number(delaySeconds)||0))]);
  return result.rows[0].id;
}

export async function claimJob(workerId){return transaction(async client=>{const result=await client.query(`WITH candidate AS (
SELECT id FROM job_queue WHERE (status='queued' OR (status='processing' AND locked_at<now()-interval '15 minutes')) AND available_at<=now() AND attempts<max_attempts ORDER BY priority DESC,available_at ASC,id ASC FOR UPDATE SKIP LOCKED LIMIT 1)
UPDATE job_queue q SET status='processing',locked_at=now(),locked_by=$1,attempts=q.attempts+1,updated_at=now() FROM candidate c WHERE q.id=c.id RETURNING q.*`,[workerId]);return result.rows[0]||null})}

export async function completeJob(jobId){await query(`UPDATE job_queue SET status='completed',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1`,[jobId])}
export async function failJob(job,error){const terminal=Number(job.attempts)>=Number(job.max_attempts);const backoff=Math.min(3600,Math.pow(2,Math.max(0,Number(job.attempts)-1))*30);await query(`UPDATE job_queue SET status=$2,last_error=$3,locked_at=NULL,locked_by=NULL,available_at=CASE WHEN $2='queued' THEN now()+($4::text||' seconds')::interval ELSE available_at END,updated_at=now() WHERE id=$1`,[job.id,terminal?'failed':'queued',String(error||'Unknown job failure').slice(0,1000),String(backoff)])}
export async function queueStats(){const result=await query(`SELECT queue_name,status,count(*)::int count FROM job_queue WHERE created_at>now()-interval '7 days' GROUP BY queue_name,status ORDER BY queue_name,status`);return result.rows}
export async function pruneJobs(){await query(`DELETE FROM job_queue WHERE status='completed' AND updated_at<now()-interval '7 days'`);await query(`DELETE FROM job_queue WHERE status='failed' AND updated_at<now()-interval '30 days'`)}
