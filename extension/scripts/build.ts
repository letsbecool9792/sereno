// Builds the unpacked extension into extension/dist (chrome://extensions → Developer mode → Load unpacked) and a zip
// of it (extension/sereno-extension.zip).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

async function build(opts: Parameters<typeof Bun.build>[0]) {
  const out = await Bun.build({ outdir: dist, target: "browser", minify: true, ...opts });
  if (!out.success) {
    for (const l of out.logs) console.error(l);
    process.exit(1);
  }
  for (const o of out.outputs) if (!o.path.includes("assets")) console.log(`${o.path.slice(root.length + 1)}  ${(o.size / 1024).toFixed(0)} KB`);
}
// The content script and the service worker are classic scripts; the popup is a module page with its CSS and fonts.
await build({ entrypoints: [join(root, "src/content.ts"), join(root, "src/background.ts")], format: "iife", naming: "[name].js" });
await build({ entrypoints: [join(root, "src/popup/main.tsx")], format: "esm", naming: { entry: "popup.[ext]", asset: "assets/[name]-[hash].[ext]" } });
for (const f of ["manifest.json", "popup.html", "icons"]) cpSync(join(root, f), join(dist, f), { recursive: true });
if (!existsSync(join(dist, "popup.css"))) console.warn("warning: no popup.css was emitted");

const zip = join(root, "sereno-extension.zip");
rmSync(zip, { force: true });
const z =
  process.platform === "win32"
    ? Bun.spawnSync(["powershell", "-NoProfile", "-Command", `Compress-Archive -Path '${dist}\*' -DestinationPath '${zip}'`])
    : Bun.spawnSync(["zip", "-qr", zip, "."], { cwd: dist });
console.log(existsSync(zip) ? "zip: sereno-extension.zip" : `zip skipped (${z.stderr.toString().trim() || "no zip tool"})`);
