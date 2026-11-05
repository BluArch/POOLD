import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";

test("wishlists: buyers start and join, an organizer turns one into a group", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const title = `Late-night snacks ${Date.now()}`;
    const created = await call(
      "/wishlists",
      "POST",
      {
        title,
        store: "Costco",
        pickupLocation: "UVic SUB main lobby",
        note: "For our floor",
        items: [
          { name: "Goldfish Cheddar snack packs", catalogKey: "goldfish-24" },
          { name: "Something unusual", catalogKey: "not-a-real-key" },
        ],
      },
      t.jordan,
    );
    assert.equal(created.status, 201);
    const wid = created.body.id;
    const find = async (auth: string) =>
      (await call("/wishlists", "GET", undefined, auth)).body.find(
        (w: any) => w.id === wid,
      );
    let w = await find(t.alex);
    assert.equal(w.memberCount, 1);
    assert.equal(w.joined, false);
    assert.equal(w.items.length, 2);
    assert.equal(
      w.items.find((i: any) => i.name === "Something unusual").catalogKey,
      null,
    );
    // Alex wants one of the items and adds another.
    const fish = w.items.find((i: any) => i.catalogKey === "goldfish-24");
    assert.equal(
      (
        await call(
          `/wishlists/${wid}/items/${fish.id}/want`,
          "PUT",
          { wanted: true },
          t.alex,
        )
      ).status,
      200,
    );
    await call(
      `/wishlists/${wid}/items`,
      "POST",
      { name: "Coca-Cola", catalogKey: "coke-32" },
      t.alex,
    );
    w = await find(t.alex);
    assert.equal(w.joined, true);
    assert.equal(w.memberCount, 2);
    assert.equal(w.items.find((i: any) => i.id === fish.id).wants, 2);
    assert.equal(w.items.length, 3);
    // Only the creator can delete it.
    assert.equal(
      (await call(`/wishlists/${wid}`, "DELETE", undefined, t.alex)).status,
      403,
    );
    // Maya organizes it: the draft is linked and the wishlist leaves the board.
    const order = await call(
      "/orders",
      "POST",
      { ...draft(), name: title, wishlistId: wid },
      t.maya,
    );
    assert.equal(order.status, 201, JSON.stringify(order.body));
    h.ids.push(order.body.id);
    assert.equal(await find(t.alex), undefined);
    const detail = (await call(`/wishlists/${wid}`, "GET", undefined, t.alex))
      .body;
    assert.equal(detail.status, "claimed");
    assert.equal(detail.orderId, order.body.id);
    // A second organizer can't take the same wishlist.
    const again = await call(
      "/orders",
      "POST",
      { ...draft(), wishlistId: wid },
      t.priya,
    );
    assert.equal(again.body.error.code, "WISHLIST_TAKEN");
    // Publishing tells everyone who wanted it.
    await h.publish(order.body.id);
    const updates = (await call("/notifications", "GET", undefined, t.alex))
      .body;
    assert.ok(updates.some((n: any) => n.message.includes("is now a group")));
    // Cancelling frees the wishlist again.
    await call(
      `/orders/${order.body.id}/status`,
      "POST",
      { status: "cancelled" },
      t.maya,
    );
    assert.equal((await find(t.alex)).status, "open");
  } finally {
    await h.close();
  }
});
