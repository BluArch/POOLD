#!/usr/bin/env node
// Run POOLD so classmates can open it on their phones with a link.
//
//   npm run phone          public https link (Cloudflare quick tunnel) + Wi-Fi link
//   npm run phone -- --lan only the Wi-Fi link (phones must be on the same network)
//
// It builds the web app once, then the API serves both the app and /api on
// port 4000, so there's only one address to share. Stop with Ctrl+C.
import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lanOnly = process.argv.includes("--lan");
const port = process.env.PORT || "4000";

if (!existsSync(join(root, ".env"))) {
  console.error("Missing .env at the project root. Copy .env.example first.");
  process.exit(1);
}

console.log("\n1/3  Building the web app (about a minute)…\n");
const build = spawnSync("npx", ["expo", "export", "--platform", "web"], {
  cwd: join(root, "apps/mobile"),
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_API_URL: "/api" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

console.log("\n2/3  Starting POOLD on port " + port + "…\n");
const api = spawn("npx", ["tsx", "--env-file=../../.env", "src/index.ts"], {
  cwd: join(root, "apps/api"),
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: port,
    STATIC_WEB_DIR: "../mobile/dist",
    // The tunnel adds one proxy hop; this lets rate limits see each phone.
    TRUST_PROXY_HOPS: "1",
  },
});

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${port}`);

const children = [api];
const stop = () => {
  for (const c of children) c.kill("SIGINT");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

setTimeout(() => {
  console.log("\n3/3  Share one of these links:\n");
  for (const url of lan) console.log("   Same Wi-Fi:  " + url);
  if (lanOnly) return;
  console.log("   Public link: starting… (needs internet)\n");
  const tunnel = spawn(
    "npx",
    [
      "--yes",
      "cloudflared",
      "tunnel",
      "--no-autoupdate",
      "--url",
      `http://localhost:${port}`,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(tunnel);
  let shown = false;
  const watch = (chunk) => {
    const match = String(chunk).match(
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
    );
    if (match && !shown) {
      shown = true;
      console.log("\n   ✅ Public link (works on any phone): " + match[0]);
      console.log(
        "      Open it in Safari/Chrome, then Share → Add to Home Screen.\n",
      );
    }
  };
  tunnel.stdout.on("data", watch);
  tunnel.stderr.on("data", watch);
  tunnel.on("exit", (code) => {
    if (!shown)
      console.log(
        "\n   Couldn’t start the public link (code " +
          code +
          "). The Wi-Fi link above still works.\n",
      );
  });
}, 4000);
