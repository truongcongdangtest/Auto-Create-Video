// Throwaway: render EVERY illustration in the library as a labelled grid so we
// can eyeball all of them in one screenshot.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ILLUSTRATIONS } from "./src/render/html-composer.js";

const cells = Object.entries(ILLUSTRATIONS)
  .map(
    ([key, svg]) => `
    <div class="cell">
      <div class="art">${svg}</div>
      <div class="lbl">${key}</div>
    </div>`,
  )
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { --accent:#FF6A3D; --accent-rgb:255,106,61; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0c0c0f; font-family: 'Segoe UI', sans-serif; padding:28px; }
  .grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:18px; }
  .cell { background:linear-gradient(160deg,#141418,#1d1d24); border:1px solid #2a2a33; border-radius:16px;
          padding:14px 10px 10px; display:flex; flex-direction:column; align-items:center; }
  .art { width:150px; height:150px; color:var(--accent);
         filter: drop-shadow(0 8px 30px rgba(var(--accent-rgb),0.4)); }
  .art svg { width:100%; height:100%; display:block; }
  .lbl { margin-top:10px; color:#cfcfd6; font-size:14px; font-weight:600; letter-spacing:.2px; }
</style></head><body>
  <div class="grid">${cells}</div>
</body></html>`;

writeFileSync(join("preview-out", "grid.html"), html, "utf8");
console.log("wrote preview-out/grid.html with", Object.keys(ILLUSTRATIONS).length, "illustrations");
