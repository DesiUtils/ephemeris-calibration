/**
 * Verifies the retained evidence INPUTS against SHA256SUMS.txt.
 *
 * Scope, and the reason for it: this checks only the files the harnesses READ, meaning the eight
 * horizons-*.txt fetches and swiss-production-audit.md. The *.output.json files are deliberately
 * NOT hashed here, because `npm run reproduce` rewrites them. Their integrity is established by
 * `git diff --exit-code -- docs/evidence` after a reproduce run, which is a stronger check: it
 * proves they regenerate from these inputs rather than merely proving nobody edited them.
 *
 * Exits 0 on a full match, 1 on any mismatch, missing file or unlisted extra input.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR = join(ROOT, "docs", "evidence", "ephemeris-calibration");
const MANIFEST = join(ROOT, "SHA256SUMS.txt");

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const expected = new Map(
  readFileSync(MANIFEST, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [hash, ...rest] = line.split(/\s+/);
      return [rest.join(" "), hash];
    })
);

// Every input the harnesses read. Outputs are excluded by design, see the docblock.
const actualInputs = readdirSync(EVIDENCE_DIR)
  .filter((f) => !f.endsWith(".output.json"))
  .sort();

const failures = [];

for (const file of actualInputs) {
  const rel = `docs/evidence/ephemeris-calibration/${file}`;
  const want = expected.get(rel);
  if (!want) {
    failures.push(`UNLISTED  ${rel} is present but absent from SHA256SUMS.txt`);
    continue;
  }
  const got = sha256(join(EVIDENCE_DIR, file));
  if (got !== want) {
    failures.push(`MISMATCH  ${rel}\n            expected ${want}\n            actual   ${got}`);
  }
  expected.delete(rel);
}

for (const missing of expected.keys()) {
  failures.push(`MISSING   ${missing} is listed in SHA256SUMS.txt but not present`);
}

if (failures.length > 0) {
  process.stderr.write(`\nevidence hash verification FAILED\n\n${failures.join("\n")}\n\n`);
  process.exit(1);
}

process.stderr.write(`\nevidence hash verification OK: ${actualInputs.length} input files match SHA256SUMS.txt\n`);
