import { setTimeout as pause } from "node:timers/promises";
import { chromium, type Page } from "playwright";

const origin = "https://www.costco.ca";
const postalCode = "V9B 6A2";
const tileSelector = '[data-tile-index][data-testid^="ProductTile_"]';
const categories = [
  "/household.html",
  "/baking-packaged-food.html",
  "/snacks.html",
  "/water-beverages.html",
  "/coffee-tea.html",
  "/health-beauty.html",
  "/baby-kids.html",
  "/pet-supplies.html",
];

export function costcoProductId(link: unknown) {
  if (typeof link !== "string") return null;
  const url = URL.parse(link);
  return url?.origin === origin
    ? (/^\/p\/-\/[^/]+\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? null)
    : null;
}

export function readCostcoTile(tile: {
  price?: string;
  warehouse?: string;
  lines: string[];
}) {
  const price = tile.price?.trim().match(/^\$([\d,]+)\.(\d{2})$/);
  const onlinePackPriceCents = price
    ? Number(price[1].replaceAll(",", "")) * 100 + Number(price[2])
    : undefined;
  const stock = (tile.warehouse ?? tile.lines.join("\n")).trim();
  const langfordStatus =
    /(?:^|\n)(In Stock|Out of Stock)\s*\n\s*at Langford(?:\n|$)/i
      .exec(stock)?.[1]
      .toLowerCase();
  const warehouseStock =
    langfordStatus === "in stock"
      ? ("available" as const)
      : langfordStatus === "out of stock"
        ? ("unavailable" as const)
        : undefined;
  return { onlinePackPriceCents, warehouseStock };
}

async function openCategory(page: Page, category: string) {
  const url = new URL(category, origin);
  // This is the query parameter produced by Costco's visible stock filter.
  url.searchParams.set("refinement", "showOutOfStock=true");
  const response = await page.goto(url.href, { waitUntil: "domcontentloaded" });
  if (!response?.ok() || new URL(page.url()).origin !== origin)
    throw new Error(
      `Costco category ${category} returned HTTP ${response?.status() ?? "unknown"}.`,
    );
  await page.locator(tileSelector).first().waitFor({ state: "visible" });
}

async function selectLangford(page: Page) {
  const locations = page.getByRole("navigation", {
    name: "Locations",
    exact: true,
  });
  const warehouse = locations.getByTestId(
    "Button_locationselector_WarehouseSelector--submit",
  );
  const delivery = locations.getByTestId(
    "Button_locationselector_DeliveryLocationSelector--submit",
  );

  if ((await delivery.innerText()) !== postalCode) {
    await delivery.click();
    const dialog = page.getByRole("dialog", {
      name: "Change Delivery Location",
    });
    await dialog
      .getByRole("textbox", { name: "Postal Code", exact: true })
      .fill(postalCode);
    await dialog
      .getByRole("button", { name: "Change Delivery Location", exact: true })
      .click();
    await locations
      .getByRole("button", {
        name: /Postal Code V9B 6A2, current delivery location/i,
      })
      .waitFor();
  }

  const selectedWarehouse = locations.getByRole("button", {
    name: "Langford, current warehouse",
  });
  if (!(await selectedWarehouse.isVisible())) {
    await warehouse.click();
    const dialog = page.getByRole("dialog", { name: "Find a Warehouse" });
    const search = dialog.getByRole("combobox", {
      name: "City, Province, or Postal Code",
    });
    await search.fill(postalCode);
    await search.press("Enter");
    await dialog
      .getByRole("button", {
        name: "Set as My Warehouse Langford",
        exact: true,
      })
      .click();
  }
  await selectedWarehouse.waitFor();
}

export async function scrapeCostcoLangford(
  itemByProductId: Map<string, string>,
) {
  const browser = await chromium.launch({
    executablePath: process.env.COSTCO_BROWSER_EXECUTABLE_PATH,
  });
  try {
    const page = await browser.newPage({
      locale: "en-CA",
      viewport: { width: 1360, height: 850 },
    });
    page.setDefaultTimeout(20_000);
    await page.route("**/*", (route) =>
      ["image", "font", "media"].includes(route.request().resourceType())
        ? route.abort()
        : route.continue(),
    );
    await openCategory(page, categories[0]);
    await selectLangford(page);

    const observedAt = new Date().toISOString();
    const items = new Map<
      string,
      {
        itemNumber: string;
        onlinePackPriceCents?: number;
        warehouseStock?: "available" | "unavailable";
      }
    >();
    const seenProducts = new Set<string>();
    for (const category of categories) {
      await openCategory(page, category);
      const heading = page.getByRole("heading", {
        name: /^Showing [\d,]+-[\d,]+ of [\d,]+$/,
      });
      const langford = page
        .getByRole("navigation", { name: "Locations", exact: true })
        .getByRole("button", { name: "Langford, current warehouse" });
      const stockFilter = page.getByRole("checkbox", {
        name: "Show Out of Stock Items",
      });
      await langford.waitFor();
      let pages = 0;
      for (;;) {
        await langford.waitFor();
        if (!(await stockFilter.isChecked()))
          throw new Error(`Costco stock filter is inactive on ${category}.`);
        const tiles = await page.locator(tileSelector).evaluateAll((elements) =>
          elements.map((element) => {
            const productId =
              element.getAttribute("data-testid")?.split("_")[1] ?? "";
            return {
              productId,
              price: element.querySelector<HTMLElement>(
                `[data-testid="Text_Price_${productId}"]`,
              )?.innerText,
              warehouse: element.querySelector<HTMLElement>(
                `[data-testid="WarehouseChannelBadge_${productId}"]`,
              )?.innerText,
              lines: (element as HTMLElement).innerText
                .split("\n")
                .map((line) => line.trim()),
            };
          }),
        );
        if (!tiles.length)
          throw new Error(`Costco returned no tiles on ${category}.`);
        pages++;
        for (const tile of tiles) {
          const itemNumber = itemByProductId.get(tile.productId);
          if (!itemNumber || seenProducts.has(tile.productId)) continue;
          seenProducts.add(tile.productId);
          const { onlinePackPriceCents, warehouseStock } = readCostcoTile(tile);
          if (
            onlinePackPriceCents !== undefined ||
            warehouseStock !== undefined
          )
            items.set(itemNumber, {
              itemNumber,
              onlinePackPriceCents,
              warehouseStock,
            });
        }

        const next = page.getByRole("button", {
          name: "Go to next page",
          exact: true,
        });
        if (!(await next.isVisible()) || !(await next.isEnabled())) break;
        if (pages >= 60)
          throw new Error(
            `Costco pagination exceeded 60 pages on ${category}.`,
          );
        const previousPage = await heading.innerText();
        await pause(500);
        await next.click();
        await page
          .getByRole("heading", { name: previousPage, exact: true })
          .waitFor({ state: "hidden" });
        await heading.waitFor();
        await page.locator(tileSelector).first().waitFor({ state: "visible" });
      }
      console.log(
        `Checked ${pages} page(s) on ${category}; ${items.size} existing items matched so far.`,
      );
    }
    return {
      source: "costco.ca",
      warehouseId: "256",
      currency: "CAD",
      observedAt,
      items: [...items.values()],
    };
  } finally {
    await browser.close();
  }
}
