/**
 * Script to generate minimal-button.zip test fixture.
 * Run: npx tsx src/__fixtures__/create-minimal-zip.ts
 */
import JSZip from "jszip";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="component-group">
    <button class="btn btn-primary">
      <span class="btn-label">Continue</span>
    </button>
    <button class="btn btn-secondary">
      <span class="btn-label">Cancel</span>
    </button>
  </div>
</body>
</html>`;

const css = `.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-family: 'Geist', sans-serif;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #2563EB;
  color: #FFFFFF;
}

.btn-primary:hover {
  background-color: #1D4ED8;
}

.btn-secondary {
  background-color: transparent;
  color: #E7E9EC;
  border: 1px solid #34373D;
}

.btn-label {
  line-height: 1;
}`;

async function main() {
  const zip = new JSZip();
  zip.file("index.html", html);
  zip.file("styles.css", css);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(join(__dirname, "minimal-button.zip"), buf);
  console.log("Created minimal-button.zip");
}

main();
