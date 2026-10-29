import { database } from "./db.js";
import { runJobs } from "./jobs.js";
import { dispatchPush, firebaseSender } from "./push.js";
import { createApp } from "./app.js";
const db = database();
await db.query("SELECT 1");
const app = createApp(db);
const server = app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0", () =>
  console.log(`POOLD API ready on port ${process.env.PORT ?? 4000}`),
);
let running = false;
const sender = firebaseSender();
const tick = async () => {
  if (running) return;
  running = true;
  try {
    await runJobs(db);
    await dispatchPush(db, sender);
  } catch (e) {
    console.error("Order job failed:", e);
  } finally {
    running = false;
  }
};
const timer = setInterval(() => void tick(), 60_000);
void tick();
async function shutdown() {
  clearInterval(timer);
  server.close();
  await db.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
