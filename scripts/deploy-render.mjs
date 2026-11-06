import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const commit = process.env.DEPLOY_COMMIT;
assert.match(commit ?? "", /^[a-f0-9]{40}$/, "DEPLOY_COMMIT must be a full Git SHA");
assert.ok(process.env.RENDER_DEPLOY_HOOK, "Set the RENDER_DEPLOY_HOOK repository Actions secret");
const hook = new URL(process.env.RENDER_DEPLOY_HOOK);
assert.equal(hook.origin, "https://api.render.com", "Use the official Render deploy hook");
assert.equal(hook.pathname, "/deploy/srv-dbi5h5dg1s2s73e2f990", "The hook must target the existing POOLD service");
hook.searchParams.set("ref", commit);

// Do not print the URL, response body, or fetch errors: they can contain the key.
let response;
try {
  response = await fetch(hook, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
} catch {
  throw new Error("Could not reach the Render deploy hook; check Render and rerun the workflow.");
}
assert.ok(response.ok, `Render rejected the deploy (HTTP ${response.status})`);
console.log(`Render accepted commit ${commit}; waiting for the live app.`);

const deadline = Date.now() + 17 * 60_000;
while (Date.now() < deadline) {
  try {
    const version = await fetch("https://poold.onrender.com/api/version", {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (version.ok && (await version.json()).commit === commit) {
      console.log(`Commit ${commit} is live at https://poold.onrender.com`);
      process.exit(0);
    }
  } catch {
    // Render Free can be asleep or still starting up while migrations run.
  }
  await setTimeout(20_000);
}
throw new Error(`Commit ${commit} did not become live within 17 minutes. Check the Render deploy and migration logs.`);
