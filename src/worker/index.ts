import { startWorkers } from "./worker.js";

startWorkers();

const nodeEnv = process.env.NODE_ENV ?? "development";

// eslint-disable-next-line no-console
console.log(`👷 Worker started (env=${nodeEnv})`);