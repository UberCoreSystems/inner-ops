import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE_SVG = resolve(ROOT, 'public/brand/inner-ops-icon.svg');
const PUBLIC = resolve(ROOT, 'public');

const targets = [
  { name: 'pwa-192.png', size: 192, padding: 0 },
  { name: 'pwa-512.png', size: 512, padding: 0 },
  { name: 'pwa-512-maskable.png', size: 512, padding: 64 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0 },
];

const BG = { r: 17, g: 24, b: 39, alpha: 1 };

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function main() {
  const svg = await readFile(SOURCE_SVG);
  await ensureDir(PUBLIC);

  for (const { name, size, padding } of targets) {
    const inner = size - padding * 2;
    const rendered = await sharp(svg, { density: 384 })
      .resize(inner, inner, { fit: 'contain', background: BG })
      .png()
      .toBuffer();

    let out;
    if (padding > 0) {
      out = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: BG,
        },
      })
        .composite([{ input: rendered, top: padding, left: padding }])
        .png()
        .toBuffer();
    } else {
      out = rendered;
    }

    const target = resolve(PUBLIC, name);
    await writeFile(target, out);
    console.log(`wrote ${target} (${size}x${size}${padding ? `, ${padding}px safe-zone` : ''})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
