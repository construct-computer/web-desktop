#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function safeToken(value, label) {
  if (!/^[a-zA-Z0-9._-]{1,96}$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, dots, underscores, or dashes`);
  }
  return value;
}

function gitShortSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

function timestampVersion() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return `${packageJson.version}-${stamp}-${gitShortSha()}`;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

const args = parseArgs(process.argv.slice(2));
const env = String(args.env || 'staging');
const channel = safeToken(String(args.channel || (env === 'production' ? 'production' : 'staging')), 'channel');
const version = safeToken(String(args.version || timestampVersion()), 'version');
const bucket = String(args.bucket || (env === 'production' ? 'construct-storage-production' : 'construct-storage-staging'));
const minNativeVersion = args.minNativeVersion ? safeToken(String(args.minNativeVersion), 'minNativeVersion') : undefined;
const notes = args.notes ? String(args.notes) : undefined;
const upload = args.upload === true || args.upload === 'true';
const skipBuild = args.skipBuild === true || args.skipBuild === 'true';

const distDir = join(root, 'dist');
const outDir = join(root, '.ota', version);
const bundlePath = join(outDir, 'bundle.zip');
const manifestPath = join(outDir, 'channel.json');
const bundleKey = `ota/bundles/${version}.zip`;
const manifestKey = `ota/channels/${channel}.json`;

if (!skipBuild) {
  run('pnpm', [env === 'production' ? 'build:capacitor:production' : 'build:capacitor:staging']);
}

if (!existsSync(distDir)) {
  throw new Error(`Missing ${distDir}; run pnpm build:capacitor first`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
run('zip', ['-qr', bundlePath, '.'], { cwd: distDir });

const manifest = {
  version,
  channel,
  bundleKey,
  checksum: sha256(bundlePath),
  size: readFileSync(bundlePath).byteLength,
  publishedAt: new Date().toISOString(),
  ...(minNativeVersion ? { minNativeVersion } : {}),
  ...(notes ? { notes } : {}),
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`OTA bundle: ${bundlePath}`);
console.log(`OTA manifest: ${manifestPath}`);
console.log(`Channel: ${channel}`);
console.log(`Version: ${version}`);
console.log(`Checksum: ${manifest.checksum}`);

if (upload) {
  run('pnpm', [
    'exec',
    'wrangler',
    'r2',
    'object',
    'put',
    `${bucket}/${bundleKey}`,
    '--file',
    bundlePath,
    '--content-type',
    'application/zip',
  ]);
  run('pnpm', [
    'exec',
    'wrangler',
    'r2',
    'object',
    'put',
    `${bucket}/${manifestKey}`,
    '--file',
    manifestPath,
    '--content-type',
    'application/json',
  ]);
  console.log(`Uploaded ${bundleKey} and ${manifestKey} to ${bucket}`);
}
