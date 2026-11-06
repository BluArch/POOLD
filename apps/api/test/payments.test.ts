import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { execute } from "../src/db.js";

test("organizer rules: own share, scheduled cutoff and card before joining", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    // The organizer has to take a share before closing.
    assert.equal(
      (await call(`/orders/${id}/status`, "POST", { status: "locked" }, t.maya))
        .body.error.code,
      "ORGANIZER_SHARE",
    );
    // A saved schedule cannot be moved earlier by a close action.
    const solo = await h.create();
    await h.publish(solo);
    await h.claim(solo, t.maya);
    assert.equal(
      (
        await call(
          `/orders/${solo}/status`,
          "POST",
          { status: "locked" },
          t.maya,
        )
      ).status,
      409,
    );
    // Buyers need a saved card to confirm shares.
    await execute(
      h.db,
      "DELETE FROM payment_methods WHERE user_id='demo-priya'",
    );
    await execute(
      h.db,
      "DELETE FROM payment_profiles WHERE user_id='demo-priya'",
    );
    const v = (await call(`/orders/${id}`, "GET", undefined, t.priya)).body;
    const r = await call(
      `/orders/${id}/claims`,
      "PUT",
      {
        revision: v.order.revision,
        attending: true,
        claims: [{ itemId: v.items[0].id, quantity: 1 }],
      },
      t.priya,
    );
    assert.equal(r.body.error.code, "CARD_REQUIRED");
    // No weekly cap: an organizer can publish several groups back to back.
    for (let n = 0; n < 3; n++) {
      const more = await h.create();
      assert.equal(
        (await call(`/orders/${more}/publish`, "POST", {}, t.maya)).status,
        200,
      );
    }
  } finally {
    await execute(
      h.db,
      "INSERT IGNORE INTO payment_methods(user_id,brand,last4,outcome) VALUES('demo-priya','Visa','4242','ok')",
    );
    await h.close();
  }
});

test("accounts: only UVic emails can sign up or sign in", async () => {
  const h = await setup();
  try {
    const gmail = await h.call("/auth/register", "POST", {
      name: "Not UVic",
      email: `someone-${Date.now()}@gmail.com`,
      password: "long enough password",
    });
    assert.equal(gmail.status, 400);
    assert.match(JSON.stringify(gmail.body), /uvic\.ca/);
    const login = await h.call("/auth/login", "POST", {
      email: "someone@gmail.com",
      password: "whatever",
    });
    assert.equal(login.body.error.code, "UVIC_ONLY");
  } finally {
    await h.close();
  }
});
