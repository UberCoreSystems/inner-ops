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
const IOS_COVER = resolve(IOS_ASSETS, 'LaunchImage.imageset');

// node scripts/generate-pwa-icons.mjs        PWA icons in public/
// node scripts/generate-pwa-icons.mjs ios    app icon, launch image and app-switcher cover in ios/
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
    // What the app lock shows in place of the app in the app switcher: the
    // launch screen as one image, a 200pt mark centred on a 430x932pt canvas.
    // The privacy-screen plugin stretches the image named LaunchImage to fill
    // the screen, so the bare mark above would come out four times too large.
    // Not a launch image: the 25 MB limit does not apply to it.
    { dir: IOS_COVER, name: 'launch-cover@2x.png', size: 400, padding: 0, canvas: [860, 1864], opaque: true },
    { dir: IOS_COVER, name: 'launch-cover@3x.png', size: 600, padding: 0, canvas: [1290, 2796], opaque: true },
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
    await access(IOS_COVER);
  } else {
    await ensureDir(PUBLIC);
  }

  for (const { dir, name, size, padding, opaque, canvas } of targets) {
    const inner = size - padding * 2;
    const [width, height] = canvas || [size, size];
    const rendered = await sharp(svg, { density: 384 })
      .resize(inner, inner, { fit: 'contain', background: BG })
      .png()
      .toBuffer();

    let out;
    if (width > inner || height > inner) {
      out = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: BG,
        },
      })
        .composite([{ input: rendered, top: (height - inner) / 2, left: (width - inner) / 2 }])
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
    console.log(`wrote ${target} (${width}x${height}${padding ? `, ${padding}px safe-zone` : ''})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
