import { maintenanceJobs } from '../lib/monitor.js';
try { console.log(JSON.stringify(await maintenanceJobs(), null, 2)); process.exit(0); }
catch (error) { console.error(error); process.exit(1); }
