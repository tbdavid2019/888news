import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BRAND_DIR = path.resolve(import.meta.dirname, "../industry/brand");

function makeSvg({ radius = 112 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF7A1A" />
      <stop offset="60%" stop-color="#FF5A00" />
      <stop offset="100%" stop-color="#E54400" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#orangeGrad)" />
  <g fill="#FFFFFF" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif">
    <text x="256" y="254" font-size="172" font-weight="900" letter-spacing="-4">888</text>
    <text x="256" y="382" font-size="110" font-weight="800" letter-spacing="1">news</text>
  </g>
</svg>`;
}

function buildIco(entries: Array<{ size: number; data: Buffer }>): Buffer {
  const head = Buffer.alloc(6 + entries.length * 16);
  head.writeUInt16LE(0, 0); // Reserved
  head.writeUInt16LE(1, 2); // Type 1 = ICO
  head.writeUInt16LE(entries.length, 4); // Number of images

  let offset = head.length;
  entries.forEach((e, i) => {
    const at = 6 + i * 16;
    head[at] = e.size >= 256 ? 0 : e.size; // Width
    head[at + 1] = e.size >= 256 ? 0 : e.size; // Height
    head[at + 2] = 0; // Colors (0 = no palette)
    head[at + 3] = 0; // Reserved
    head.writeUInt16LE(1, at + 4); // Color planes
    head.writeUInt16LE(32, at + 6); // Bits per pixel
    head.writeUInt32LE(e.data.length, at + 8); // Image size in bytes
    head.writeUInt32LE(offset, at + 12); // Image data offset
    offset += e.data.length;
  });

  return Buffer.concat([head, ...entries.map((e) => e.data)]);
}

async function main() {
  console.log(`Generating brand icons into ${BRAND_DIR}...`);

  const svgContent = makeSvg({ radius: 112 });
  const svgBuffer = Buffer.from(svgContent);

  // 1. Write SVG vectors
  fs.writeFileSync(path.join(BRAND_DIR, "favicon.svg"), svgContent);
  fs.writeFileSync(path.join(BRAND_DIR, "logo.svg"), svgContent);
  console.log("✓ Written favicon.svg and logo.svg");

  // 2. Base 512x512 PNG
  const base512 = await sharp(svgBuffer).png().toBuffer();
  fs.writeFileSync(path.join(BRAND_DIR, "icon-512.png"), base512);
  fs.writeFileSync(path.join(BRAND_DIR, "icon.png"), base512);
  console.log("✓ Written icon-512.png and icon.png");

  // 3. 192x192 PNG
  const p192 = await sharp(base512).resize(192, 192).png().toBuffer();
  fs.writeFileSync(path.join(BRAND_DIR, "icon-192.png"), p192);
  console.log("✓ Written icon-192.png");

  // 4. Apple Touch Icons (180x180)
  const p180 = await sharp(base512).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(BRAND_DIR, "apple-touch-icon.png"), p180);
  fs.writeFileSync(path.join(BRAND_DIR, "apple-icon.png"), p180);
  console.log("✓ Written apple-touch-icon.png and apple-icon.png");

  // 5. Favicons (32x32, 16x16)
  const p48 = await sharp(base512).resize(48, 48).png().toBuffer();
  const p32 = await sharp(base512).resize(32, 32).png().toBuffer();
  const p16 = await sharp(base512).resize(16, 16).png().toBuffer();
  fs.writeFileSync(path.join(BRAND_DIR, "favicon-32x32.png"), p32);
  fs.writeFileSync(path.join(BRAND_DIR, "favicon-16x16.png"), p16);
  console.log("✓ Written favicon-32x32.png and favicon-16x16.png");

  // 6. Multi-resolution favicon.ico
  const icoBuffer = buildIco([
    { size: 16, data: p16 },
    { size: 32, data: p32 },
    { size: 48, data: p48 },
  ]);
  fs.writeFileSync(path.join(BRAND_DIR, "favicon.ico"), icoBuffer);
  console.log("✓ Written favicon.ico (16, 32, 48)");

  console.log("All brand icons generated successfully!");
}

main().catch((err) => {
  console.error("Failed to generate icons:", err);
  process.exit(1);
});
