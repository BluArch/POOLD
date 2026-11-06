import { assertPaymentSchema } from "./payments/schema.js";
import { database } from "./db.js";
import { runJobs } from "./jobs.js";
import { dispatchPush, firebaseSender } from "./push.js";
const db = database();
try {
  await assertPaymentSchema(db);
  console.log(await runJobs(db));
  console.log(await dispatchPush(db, firebaseSender()));
} finally {
  await db.end();
}
