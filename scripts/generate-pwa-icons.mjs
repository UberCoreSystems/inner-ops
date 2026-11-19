import sharp from 'sharp';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE_SVG = resolve(ROOT, 'public/brand/inner-ops-icon.svg');
const PUBLIC = resolve(ROOT, 'public');
const IOS_ASSETS = resolve(ROOT, 'ios/App/App/Assets.xcassets');
const IOS_SPLASH = resolve(IOS_ASSETS, 'Splash.imageset');

// node scripts/generate-pwa-icons.mjs        PWA icons in public/
// node scripts/generate-pwa-icons.mjs ios    app icon and launch image in ios/
const targetSets = {
  pwa: [
    { dir: PUBLIC, name: 'pwa-192.png', size: 192, padding: 0 },
    { dir: PUBLIC, name: 'pwa-512.png', size: 512, padding: 0 },
    { dir: PUBLIC, name: 'pwa-512-maskable.png', size: 512, padding: 64 },
    { dir: PUBLIC, name: 'apple-touch-icon.png', size: 180, padding: 0 },
  ],
  // The App Store rejects an icon with an alpha channel, so these are
  // flattened. iOS will not render a launch screen whose image decodes to more
  // than 25 MB (a 2732px square, the Capacitor template's size, is 29.9 MB and
  // launches to a blank screen). LaunchScreen.storyboard therefore paints the
  // background itself and centres this 200pt mark.
  ios: [
    { dir: resolve(IOS_ASSETS, 'AppIcon.appiconset'), name: 'AppIcon-512@2x.png', size: 1024, padding: 0, opaque: true },
    { dir: IOS_SPLASH, name: 'splash.png', size: 200, padding: 0, opaque: true },
    { dir: IOS_SPLASH, name: 'splash@2x.png', size: 400, padding: 0, opaque: true },
    { dir: IOS_SPLASH, name: 'splash@3x.png', size: 600, padding: 0, opaque: true },
  ],
};

const BG = { r: 17, g: 24, b: 39, alpha: 1 };

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function main() {
  const setName = process.argv[2] || 'pwa';
  const targets = targetSets[setName];
  if (!targets) {
    throw new Error(`unknown target set "${setName}" (expected: ${Object.keys(targetSets).join(', ')})`);
  }

  const svg = await readFile(SOURCE_SVG);
  if (setName === 'ios') {
    // The asset catalogs come from `npx cap add ios`; never invent them here.
    await access(IOS_SPLASH);
  } else {
    await ensureDir(PUBLIC);
  }

  for (const { dir, name, size, padding, opaque } of targets) {
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

    if (opaque) {
      out = await sharp(out).flatten({ background: BG }).png().toBuffer();
    }

    const target = resolve(dir, name);
    await writeFile(target, out);
    console.log(`wrote ${target} (${size}x${size}${padding ? `, ${padding}px safe-zone` : ''})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
