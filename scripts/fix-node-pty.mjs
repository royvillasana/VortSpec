/**
 * node-pty ships a `spawn-helper` binary (macOS/Linux) that must be executable,
 * but pnpm's content-addressed store can land it without the +x bit — causing
 * "posix_spawnp failed" at runtime. Restore the bit after every install.
 */
import { execSync } from "node:child_process";
try {
  const out = execSync("find node_modules -path '*node-pty*/spawn-helper' -print", {
    encoding: "utf8",
  }).trim();
  if (!out) process.exit(0);
  for (const file of out.split("\n").filter(Boolean)) {
    execSync(`chmod +x "${file}"`);
  }
  console.log(`fix-node-pty: made ${out.split("\n").length} spawn-helper(s) executable`);
} catch {
  // best-effort — never fail the install
}
