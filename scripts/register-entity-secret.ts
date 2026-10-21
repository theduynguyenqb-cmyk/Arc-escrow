/**
 * One-time entity secret registration script.
 * Run with: bun run scripts/register-entity-secret.ts
 * NEVER commit this file's output or the .env values it writes.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  console.error("ERROR: CIRCLE_API_KEY is not set in .env");
  process.exit(1);
}

// 1. Generate secret — captured in memory, never printed to stdout
const entitySecret = crypto.randomBytes(32).toString("hex");

// 2. Ensure recovery dir exists under /home/user/app so the user can download it
const recoveryDir = "/home/user/app/.circle";
fs.mkdirSync(recoveryDir, { recursive: true });

console.log("Registering entity secret with Circle...");

let response: Awaited<ReturnType<typeof registerEntitySecretCiphertext>>;
try {
  response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  });
} catch (err) {
  console.error("Registration failed:", err);
  process.exit(1);
}

// 3. Write recovery file if SDK didn't already
const recoveryPath = path.join(recoveryDir, "recovery_file.dat");
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile, "utf-8");
}

if (!fs.existsSync(recoveryPath)) {
  console.error("ERROR: Recovery file was not written — do not proceed.");
  process.exit(1);
}

// 4. Persist secret to .env (never log the value)
const envPath = "/home/user/app/.env";
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");

// 5. Verify registration with a read-only call
console.log("Verifying registration...");
try {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });
  await client.listWalletSets({ pageSize: 1 });
  console.log("Verification OK.");
} catch (err) {
  console.error("Verification failed — entity secret may not be registered correctly:", err);
  process.exit(1);
}

console.log("SUCCESS: Entity secret registered and verified.");
console.log(`Recovery file written to: ${recoveryPath}`);
console.log("CIRCLE_ENTITY_SECRET written to .env");
console.log("");
console.log("ACTION REQUIRED: Back up BOTH artifacts now before continuing.");
