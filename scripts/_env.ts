/**
 * Loads .env.local for scripts run outside `next`, which does it for us.
 * Import for side effects, before anything that reads process.env.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
