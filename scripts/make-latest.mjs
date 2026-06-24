// Generates the updater manifest (latest.json) that tauri-plugin-updater reads.
//
// NOTE: the GitHub Actions release workflow (.github/workflows/release.yml) builds every
// platform and generates latest.json automatically via tauri-action — you do NOT need this
// script there. This is the MANUAL fallback: run it AFTER `pnpm tauri build` (with the
// signing key env set) on each platform, then upload the installer(s) + latest.json to the
// GitHub release. It includes whichever platforms it finds a `.sig` for, so you can run it
// on Windows alone (Windows-only manifest) or after collecting both bundles. See docs/RELEASING.md.
//
//   node scripts/make-latest.mjs "Notas de la version (opcional)"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const notes = process.argv[2] || `microset v${version}`;
const base = `https://github.com/eriklueh/microset/releases/download/v${version}`;
const bundle = (p) => resolve(root, "src-tauri/target/release/bundle", p);

// platform key → { the bundle filename, its .sig path }. tauri-plugin-updater keys:
// "windows-x86_64" (NSIS) and "linux-x86_64" (AppImage).
const candidates = {
  "windows-x86_64": {
    file: `microset_${version}_x64-setup.exe`,
    sig: bundle(`nsis/microset_${version}_x64-setup.exe.sig`),
  },
  "linux-x86_64": {
    file: `microset_${version}_amd64.AppImage`,
    sig: bundle(`appimage/microset_${version}_amd64.AppImage.sig`),
  },
};

const platforms = {};
for (const [key, { file, sig }] of Object.entries(candidates)) {
  if (!existsSync(sig)) continue;
  platforms[key] = { signature: readFileSync(sig, "utf8").trim(), url: `${base}/${file}` };
}

if (Object.keys(platforms).length === 0) {
  console.error("No bundle signatures found — run `pnpm tauri build` (with the signing key) first.");
  process.exit(1);
}

const manifest = { version, notes, pub_date: new Date().toISOString(), platforms };

const out = resolve(root, "src-tauri/target/release/bundle/latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log("wrote", out, "with platforms:", Object.keys(platforms).join(", "));
console.log(JSON.stringify(manifest, null, 2));
