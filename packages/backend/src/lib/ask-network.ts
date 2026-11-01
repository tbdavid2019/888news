// Containers use the Compose service name; local processes communicate over loopback.
import { existsSync } from "node:fs";

export function askWorkerHost(inDocker = existsSync("/.dockerenv")): string {
  return process.env.ASK_WORKER_HOST || (inDocker ? "0.0.0.0" : "127.0.0.1");
}

export function askWorkerUrl(inDocker = existsSync("/.dockerenv")): string {
  return process.env.ASK_WORKER_URL || (inDocker ? "http://worker:3002" : "http://127.0.0.1:3002");
}
