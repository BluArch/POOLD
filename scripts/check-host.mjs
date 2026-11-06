import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:4000");
async function get(path) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}

assert.deepEqual(await (await get("/api/health")).json(), {
  ok: true,
  database: "mysql",
});
const home = await get("/");
assert.match(home.headers.get("content-type") ?? "", /text\/html/);
const html = await home.text();
const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"/i)?.[1];
assert.ok(script, "The exported web app must include a JavaScript bundle");
assert.equal(new URL(script, origin).origin, origin.origin);
const bundle = await get(script);
assert.match(bundle.headers.get("content-type") ?? "", /javascript/);
assert.ok((await bundle.text()).length > 0, "The web bundle must not be empty");
assert.match(
  (await get("/order/deploy-smoke-check")).headers.get("content-type") ?? "",
  /text\/html/,
);
console.log(`Hosted API, MySQL, web bundle, and deep links passed at ${origin.origin}`);
