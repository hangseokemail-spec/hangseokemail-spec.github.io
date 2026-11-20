import { readFile } from 'node:fs/promises';
import { setLoader, loadUniverse } from '../js/core/data.js';
const root = new URL('../data/', import.meta.url);
setLoader(async (p) => JSON.parse(await readFile(new URL(decodeURIComponent(p), root), 'utf8')));
await loadUniverse();
