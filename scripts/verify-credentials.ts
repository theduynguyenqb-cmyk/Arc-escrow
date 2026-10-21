import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("ERROR: CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET missing from .env");
  process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

try {
  await client.listWalletSets({ pageSize: 1 });
  console.log("OK: Credentials valid — API key + entity secret work together.");
} catch (err: unknown) {
  const e = err as { message?: string; code?: number };
  console.error("FAIL:", e?.message ?? String(err));
  process.exit(1);
}
