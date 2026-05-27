#!/usr/bin/env node
/**
 * Phase 15 — Mobile asset pipeline
 *
 * Step 1 (assets:render):
 *   resources/logo.svg     → resources/icon.png   (1024×1024, opaque brand bg)
 *   resources/splash.svg   → resources/splash.png (2732×2732)
 *   resources/logo.svg     → public/icons/icon-192.png (PWA)
 *   resources/logo.svg     → public/icons/icon-512.png (PWA)
 *   resources/logo.svg     → public/icons/maskable-512.png (PWA Android adaptive)
 *   resources/logo.svg     → public/icons/apple-touch-icon.png (iOS Safari, 180px)
 *
 * Step 2 (assets:generate, รันต่อ):
 *   `@capacitor/assets generate` อ่าน resources/{icon,splash}.png
 *   แล้วเขียนลง ios/App/App/Assets.xcassets/* + android/app/src/main/res/*
 *
 * รวบขั้นตอน: `pnpm assets:build`
 *
 * Idempotent: เขียนทับทุกครั้ง — ปลอดภัย rerun
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

const SRC_LOGO = path.join(webRoot, 'resources', 'logo.svg');
const SRC_SPLASH = path.join(webRoot, 'resources', 'splash.svg');
const OUT_ICON = path.join(webRoot, 'resources', 'icon.png');
const OUT_SPLASH = path.join(webRoot, 'resources', 'splash.png');
const PWA_DIR = path.join(webRoot, 'public', 'icons');

// `@capacitor/assets` v3 looks for these specific filenames in `resources/`
// (in extension priority .png → .webp → .jpg → .jpeg → .svg). To force it to
// use our final raster artwork instead of falling back to the SVG fallback
// we duplicate `icon.png` to the explicit slots it cares about.
const ICON_ALIASES = [
  path.join(webRoot, 'resources', 'icon-only.png'),
  path.join(webRoot, 'resources', 'icon-foreground.png'),
  path.join(webRoot, 'resources', 'logo.png'),
];

// TuKTuK brand: deep plum night background so the icon doesn't get pillarboxed
// onto a bright magenta when the source PNG isn't a perfect square.
const BRAND_BG = { r: 0x1a, g: 0x0b, b: 0x26 };

async function ensure(p) {
  await fs.mkdir(p, { recursive: true });
}

/**
 * If a hand-authored PNG exists at `resources/icon.png` and is newer than
 * `logo.svg`, we treat it as the source-of-truth and only normalize it (resize
 * to 1024² + flatten alpha) instead of re-rendering from the SVG. This lets
 * designers drop a final artwork PNG (e.g. the TuKTuK neon icon) without it
 * being clobbered by the SVG fallback on the next `pnpm assets:build`.
 */
async function pngIsAuthoritative(pngPath, svgPath) {
  try {
    const [pngStat, svgStat] = await Promise.all([fs.stat(pngPath), fs.stat(svgPath)]);
    return pngStat.mtimeMs >= svgStat.mtimeMs;
  } catch {
    return false;
  }
}

async function renderIconBase() {
  const usePng = await pngIsAuthoritative(OUT_ICON, SRC_LOGO);
  if (usePng) {
    // Normalize in place: ensure 1024², opaque, sane compression.
    const buf = await fs.readFile(OUT_ICON);
    await sharp(buf)
      .resize(1024, 1024, { fit: 'cover' })
      .flatten({ background: BRAND_BG })
      .png({ compressionLevel: 9 })
      .toFile(OUT_ICON + '.tmp');
    await fs.rename(OUT_ICON + '.tmp', OUT_ICON);
    console.log(`  ✓ ${path.relative(webRoot, OUT_ICON)} (1024×1024, from PNG source)`);
    return;
  }
  const buf = await fs.readFile(SRC_LOGO);
  await sharp(buf, { density: 384 })
    .resize(1024, 1024, { fit: 'contain', background: BRAND_BG })
    .flatten({ background: BRAND_BG })
    .png({ compressionLevel: 9 })
    .toFile(OUT_ICON);
  console.log(`  ✓ ${path.relative(webRoot, OUT_ICON)} (1024×1024, from SVG)`);
}

async function renderSplashBase() {
  const buf = await fs.readFile(SRC_SPLASH);
  await sharp(buf, { density: 192 })
    .resize(2732, 2732, { fit: 'contain', background: BRAND_BG })
    .flatten({ background: BRAND_BG })
    .png({ compressionLevel: 9 })
    .toFile(OUT_SPLASH);
  console.log(`  ✓ ${path.relative(webRoot, OUT_SPLASH)} (2732×2732)`);
}

async function renderPwaIcons() {
  await ensure(PWA_DIR);
  const sizes = [
    { name: 'icon-192.png', size: 192, masked: false },
    { name: 'icon-512.png', size: 512, masked: false },
    { name: 'maskable-512.png', size: 512, masked: true },
    { name: 'apple-touch-icon.png', size: 180, masked: false },
    { name: 'favicon-32.png', size: 32, masked: false },
    { name: 'favicon-16.png', size: 16, masked: false },
    // WebP variants referenced from manifest.json — smaller footprint for PWA
    // splash card. Match the standard sizes Android & Chrome prefer.
    { name: 'icon-48.webp', size: 48, masked: false, format: 'webp' },
    { name: 'icon-72.webp', size: 72, masked: false, format: 'webp' },
    { name: 'icon-96.webp', size: 96, masked: false, format: 'webp' },
    { name: 'icon-128.webp', size: 128, masked: false, format: 'webp' },
    { name: 'icon-192.webp', size: 192, masked: false, format: 'webp' },
    { name: 'icon-256.webp', size: 256, masked: false, format: 'webp' },
    { name: 'icon-512.webp', size: 512, masked: false, format: 'webp' },
  ];
  // Prefer the authoritative icon.png (final artwork) for PWA sizes — falling
  // back to the SVG when no hand-authored PNG is present.
  const usePng = await pngIsAuthoritative(OUT_ICON, SRC_LOGO);
  const source = usePng ? await fs.readFile(OUT_ICON) : await fs.readFile(SRC_LOGO);
  const sharpInit = usePng ? () => sharp(source) : () => sharp(source, { density: 384 });
  for (const { name, size, masked, format = 'png' } of sizes) {
    const out = path.join(PWA_DIR, name);
    if (masked) {
      // Android adaptive: ต้องมี safe-zone ~ 80% (logo อยู่ใน 80% กลาง)
      const innerSize = Math.round(size * 0.78);
      const pad = Math.round((size - innerSize) / 2);
      const inner = await sharpInit()
        .resize(innerSize, innerSize, { fit: 'contain', background: BRAND_BG })
        .png()
        .toBuffer();
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: BRAND_BG,
        },
      })
        .composite([{ input: inner, top: pad, left: pad }])
        .png({ compressionLevel: 9 })
        .toFile(out);
    } else {
      let pipeline = sharpInit()
        .resize(size, size, { fit: usePng ? 'cover' : 'contain', background: BRAND_BG })
        .flatten({ background: BRAND_BG });
      if (format === 'webp') {
        pipeline = pipeline.webp({ quality: 90 });
      } else {
        pipeline = pipeline.png({ compressionLevel: 9 });
      }
      await pipeline.toFile(out);
    }
    console.log(`  ✓ ${path.relative(webRoot, out)} (${size}×${size}${masked ? ', masked' : ''})`);
  }
}

async function syncIconAliases() {
  const buf = await fs.readFile(OUT_ICON);
  for (const alias of ICON_ALIASES) {
    await fs.writeFile(alias, buf);
    console.log(`  ✓ ${path.relative(webRoot, alias)} (alias of icon.png)`);
  }
}

async function main() {
  console.log('🎨 Rendering source assets');
  for (const f of [SRC_LOGO, SRC_SPLASH]) {
    try {
      await fs.access(f);
    } catch {
      console.error(`✖ missing source: ${f}`);
      process.exit(1);
    }
  }
  await renderIconBase();
  await syncIconAliases();
  await renderSplashBase();
  await renderPwaIcons();
  console.log('✓ done — next: `pnpm assets:generate` for native sizes');
}

main().catch((err) => {
  console.error('✖ asset build failed:', err);
  process.exit(1);
});
