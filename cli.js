#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const pkg = require('./package.json');

// --- Arg parsing ---

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${pkg.productName || pkg.name} v${pkg.version}
${pkg.description}

Usage:
  folio-reader [options] [file-or-folder]

Options:
  --folder <path>   Open a folder in the sidebar
  --version, -v     Show version number
  --help, -h        Show this help message

Examples:
  folio-reader                          Open with welcome screen
  folio-reader README.md                Open a markdown file
  folio-reader --folder ./docs          Open folder in sidebar
  folio-reader --folder ./docs README.md  Open folder + file
`.trim());
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

// --- Parse --folder and positional args ---

let folderPath = null;
const positionalArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--folder' || args[i] === '-f') {
    i++;
    if (i >= args.length) {
      console.error('Error: --folder requires a path argument');
      process.exit(1);
    }
    folderPath = args[i];
  } else if (args[i].startsWith('-')) {
    // Unknown flag — pass through to electron
    positionalArgs.push(args[i]);
  } else {
    positionalArgs.push(args[i]);
  }
}

// --- Validate folder path ---

if (folderPath) {
  folderPath = path.resolve(folderPath);
  if (!fs.existsSync(folderPath)) {
    console.error(`Error: folder not found: ${folderPath}`);
    process.exit(1);
  }
  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    console.error(`Error: not a directory: ${folderPath}`);
    process.exit(1);
  }
}

// --- Validate positional file args ---

for (const arg of positionalArgs) {
  if (arg.startsWith('-')) continue; // skip flags
  const resolved = path.resolve(arg);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: path not found: ${resolved}`);
    process.exit(1);
  }
}

// --- Resolve positional args to absolute paths ---

const resolvedArgs = positionalArgs.map(arg => {
  if (arg.startsWith('-')) return arg;
  return path.resolve(arg);
});

// --- Build electron args ---

const electronArgs = [path.join(__dirname, 'main.js')];

if (folderPath) {
  electronArgs.push('--folder', folderPath);
}

electronArgs.push(...resolvedArgs);

// --- Find electron binary ---

let electronPath;
try {
  electronPath = require('electron');
  if (typeof electronPath !== 'string') {
    // electron module exports the path as default
    electronPath = require.resolve('electron/cli.js');
  }
} catch {
  // Try to find electron in node_modules/.bin
  const localBin = path.join(__dirname, 'node_modules', '.bin', 'electron');
  if (fs.existsSync(localBin) || fs.existsSync(localBin + '.cmd')) {
    electronPath = localBin;
  } else {
    console.error('Error: electron is not installed. Run: npm install electron');
    process.exit(1);
  }
}

// --- Launch electron ---

const child = spawn(electronPath, electronArgs, {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(`Error launching Folio: ${err.message}`);
  process.exit(1);
});
