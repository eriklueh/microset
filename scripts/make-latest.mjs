// Generates the updater manifest (latest.json) that tauri-plugin-updater reads.
// Run AFTER `pnpm tauri build` (with the signing key env set), then upload both
// the installer and latest.json to the GitHub release. See docs/RELEASING.md.
//
//   node scripts/make-latest.mjs "Notas de la version (opcional)"
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const notes = process.argv[2] || `microset v${version}`;

const sigPath = resolve(
  root,
  `src-tauri/target/release/bundle/nsis/microset_${version}_x64-setup.exe.sig`,
);
const signature = readFileSync(sigPath, "utf8").trim();

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/eriklueh/microset/releases/download/v${version}/microset_${version}_x64-setup.exe`,
    },
  },
};

const out = resolve(root, "src-tauri/target/release/bundle/nsis/latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log("wrote", out);
console.log(JSON.stringify(manifest, null, 2));
