import { maintenanceJobs } from '../lib/monitor.js';
const interval = Math.max(60_000, Number(process.env.MONITOR_INTERVAL_MS || 300_000));
console.log(`[RADAR worker] starting, interval=${interval}ms`);
while (true) {
  const started = Date.now();
  try {
    const result = await maintenanceJobs();
    console.log(`[RADAR worker] ${new Date().toISOString()} completed`, JSON.stringify(result));
  } catch (error) {
    console.error(`[RADAR worker] ${new Date().toISOString()} failed`, error);
  }
  const sleep = Math.max(10_000, interval - (Date.now() - started));
  await new Promise(resolve => setTimeout(resolve, sleep));
}
