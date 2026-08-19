import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const tailwindPackage = path.dirname(fileURLToPath(import.meta.resolve('tailwindcss/package.json')));
const frameworkCss = fs.readFileSync(path.join(tailwindPackage, 'index.css'), 'utf8');
const inputCss = fs.readFileSync(path.join(root, 'src/input.css'), 'utf8');

const sourceFiles = [
  path.join(root, 'index.html'),
  ...fs.readdirSync(path.join(root, 'assets/js'))
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(root, 'assets/js', name))
];

const candidates = new Set();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/class\s*=\s*["']([^"']+)["']/g)) {
    match[1].split(/\s+/).filter(Boolean).forEach(token => candidates.add(token));
  }
}

const compiler = await compile(`${frameworkCss}\n${inputCss}`, { from: path.join(root, 'src/input.css') });
const output = compiler.build([...candidates]);
const banner = `/* Tailwind CSS 4.1.10 production build — generated from src/input.css. Do not edit directly. */\n`;
fs.writeFileSync(path.join(root, 'assets/css/tailwind.css'), banner + output);
console.log(`Built assets/css/tailwind.css (${candidates.size} candidates, ${(output.length / 1024).toFixed(1)} KiB)`);
