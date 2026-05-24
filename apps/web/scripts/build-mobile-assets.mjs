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

const BRAND_PINK = { r: 0xff, g: 0x3e, b: 0x5c };

async function ensure(p) {
  await fs.mkdir(p, { recursive: true });
}

async function renderIconBase() {
  const buf = await fs.readFile(SRC_LOGO);
  await sharp(buf, { density: 384 })
    .resize(1024, 1024, { fit: 'contain', background: BRAND_PINK })
    .flatten({ background: BRAND_PINK })
    .png({ compressionLevel: 9 })
    .toFile(OUT_ICON);
  console.log(`  ✓ ${path.relative(webRoot, OUT_ICON)} (1024×1024)`);
}

async function renderSplashBase() {
  const buf = await fs.readFile(SRC_SPLASH);
  await sharp(buf, { density: 192 })
    .resize(2732, 2732, { fit: 'contain', background: BRAND_PINK })
    .flatten({ background: BRAND_PINK })
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
  ];
  const svg = await fs.readFile(SRC_LOGO);
  for (const { name, size, masked } of sizes) {
    const out = path.join(PWA_DIR, name);
    if (masked) {
      // Android adaptive: ต้องมี safe-zone ~ 80% (logo อยู่ใน 80% กลาง)
      const innerSize = Math.round(size * 0.78);
      const pad = Math.round((size - innerSize) / 2);
      const inner = await sharp(svg, { density: 384 })
        .resize(innerSize, innerSize, { fit: 'contain', background: BRAND_PINK })
        .png()
        .toBuffer();
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: BRAND_PINK,
        },
      })
        .composite([{ input: inner, top: pad, left: pad }])
        .png({ compressionLevel: 9 })
        .toFile(out);
    } else {
      await sharp(svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: BRAND_PINK })
        .flatten({ background: BRAND_PINK })
        .png({ compressionLevel: 9 })
        .toFile(out);
    }
    console.log(`  ✓ ${path.relative(webRoot, out)} (${size}×${size}${masked ? ', masked' : ''})`);
  }
}

async function main() {
  console.log('🎨 Rendering source assets from SVG');
  for (const f of [SRC_LOGO, SRC_SPLASH]) {
    try {
      await fs.access(f);
    } catch {
      console.error(`✖ missing source: ${f}`);
      process.exit(1);
    }
  }
  await renderIconBase();
  await renderSplashBase();
  await renderPwaIcons();
  console.log('✓ done — next: `pnpm assets:generate` for native sizes');
}

main().catch((err) => {
  console.error('✖ asset build failed:', err);
  process.exit(1);
});
