#!/usr/bin/env node
// Purpose: prove that docs/ecosystem/ECOSYSTEM_ROADMAP.md is byte-identical in the
//   three WASLA repositories (nooonvg/wasla, nooonvg/wasla-core, nooonvg/ceezr).
// Roadmap item: XR-0.1 (docs/ecosystem/ECOSYSTEM_ROADMAP.md §6).
// This file is itself kept identical in the three repositories.
//
// Usage:
//   node docs/ecosystem/check-ecosystem-sync.mjs            # strict: exit 1 on any difference
//   node docs/ecosystem/check-ecosystem-sync.mjs --advisory # report only (pull requests)
//   node docs/ecosystem/check-ecosystem-sync.mjs --offline  # local structure check only
//
// No dependencies: Node >= 18 (global fetch) or Bun.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const REPOS = ["nooonvg/wasla", "nooonvg/wasla-core", "nooonvg/ceezr"];
const FILES = ["docs/ecosystem/ECOSYSTEM_ROADMAP.md", "docs/ecosystem/check-ecosystem-sync.mjs"];
const REF = process.env.ECOSYSTEM_SYNC_REF || "main";
const advisory = process.argv.includes("--advisory");
const offline = process.argv.includes("--offline");

const sha = (text) => createHash("sha256").update(text).digest("hex");
const revisionOf = (text) => {
  const m = text.match(/^\| Revision \| (\d+) \|$/m);
  return m ? Number(m[1]) : null;
};

const problems = [];
const notes = [];

const localRoadmap = readFileSync(FILES[0], "utf8");
const localRevision = revisionOf(localRoadmap);
if (localRevision === null) problems.push(`${FILES[0]}: no "| Revision | N |" row`);
for (const required of ["## 1.", "## 3.", "## 4.", "## 5.", "## 6."]) {
  if (!localRoadmap.includes(`\n${required}`)) problems.push(`${FILES[0]}: missing section ${required}`);
}

if (!offline) {
  for (const file of FILES) {
    const local = readFileSync(file, "utf8");
    const localSha = sha(local);
    for (const repo of REPOS) {
      const url = `https://raw.githubusercontent.com/${repo}/${REF}/${file}`;
      let remote;
      try {
        const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
        if (res.status === 404) {
          problems.push(`${repo}@${REF}: ${file} does not exist`);
          continue;
        }
        if (!res.ok) {
          problems.push(`${repo}@${REF}: ${file} fetch failed HTTP ${res.status}`);
          continue;
        }
        remote = await res.text();
      } catch (error) {
        problems.push(`${repo}@${REF}: ${file} fetch error ${error.message}`);
        continue;
      }
      if (sha(remote) === localSha) {
        notes.push(`= ${repo}@${REF} ${file} ${localSha.slice(0, 12)}`);
      } else {
        const detail =
          file === FILES[0] ? ` (local Revision ${localRevision}, remote Revision ${revisionOf(remote)})` : "";
        problems.push(`${repo}@${REF}: ${file} differs from local copy${detail}`);
      }
    }
  }
}

for (const note of notes) console.log(note);
if (problems.length === 0) {
  console.log(`ecosystem sync: OK (Revision ${localRevision}${offline ? ", offline" : ""})`);
  process.exit(0);
}
for (const problem of problems) console.error(`${advisory ? "warning" : "error"}: ${problem}`);
if (advisory) {
  console.log(`ecosystem sync: ${problems.length} difference(s), advisory mode — not failing`);
  process.exit(0);
}
console.error(`ecosystem sync: FAILED with ${problems.length} problem(s)`);
process.exit(1);
