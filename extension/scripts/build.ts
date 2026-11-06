// Builds the unpacked extension into extension/dist (load it at chrome://extensions → "Load unpacked"), and a zip of
// it for the Chrome Web Store or for sharing: extension/sereno-extension.zip.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const out = await Bun.build({
  entrypoints: [join(root, "src/content.ts"), join(root, "src/background.ts")],
  outdir: dist,
  target: "browser",
  format: "iife", // content scripts and this service worker are classic scripts
  minify: true,
  naming: "[name].js",
});
if (!out.success) {
  for (const l of out.logs) console.error(l);
  process.exit(1);
}
for (const f of ["manifest.json", "popup.html", "icons"]) cpSync(join(root, f), join(dist, f), { recursive: true });
for (const o of out.outputs) console.log(`${o.path.slice(root.length + 1)}  ${(o.size / 1024).toFixed(0)} KB`);

const zip = join(root, "sereno-extension.zip");
rmSync(zip, { force: true });
const z = process.platform === "win32"
  ? Bun.spawnSync(["powershell", "-NoProfile", "-Command", `Compress-Archive -Path '${dist}\*' -DestinationPath '${zip}'`])
  : Bun.spawnSync(["zip", "-qr", zip, "."], { cwd: dist });
console.log(existsSync(zip) ? `zip: ${zip.slice(root.length + 1)}` : `zip skipped (${z.stderr.toString().trim() || "no zip tool"})`);
console.log("load it: chrome://extensions → Developer mode → Load unpacked → extension/dist");
