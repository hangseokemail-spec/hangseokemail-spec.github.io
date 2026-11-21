import fs from 'fs';
import {contrast,f} from './lib.mjs';
const css=fs.readFileSync(process.argv[2] || new URL('../../css/app.css', import.meta.url), 'utf8');
const block=(sel)=>{ const i=css.indexOf(sel+' {'); const s=css.slice(i, css.indexOf('}', i)); const o={}; for (const m of s.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) o[m[1]]=m[2]; return o; };
const L=block(':root'); const D={...L, ...block(':root[data-theme="dark"]')};
const G={...D, ...block(':root[data-theme="dark"][data-updown="global"]')};
const rows=[
 ['text-1','bg-surface',4.5],['text-1','bg-page',4.5],['text-2','bg-surface',4.5],['text-2','bg-sunken',4.5],['text-3','bg-surface',4.5],['text-3','bg-page',4.5],['text-3','bg-sunken',4.5],['text-3','bg-hover',4.5],
 ['accent','bg-surface',4.5],['accent','bg-page',4.5],['accent','bg-selected',4.5],['on-accent','accent',4.5],['on-accent','accent-hover',4.5],
 ['up','bg-surface',4.5],['down','bg-surface',4.5],['up','bg-sunken',4.5],['down','bg-sunken',4.5],
 ['st-caution','st-caution-bg',4.5],['st-warning','st-warning-bg',4.5],['st-good','st-good-bg',4.5],['text-1','lowconf-bg',4.5],
 ['hl-ink','hl-bg',4.5],['text-1','hl-bg',4.5],['zone-line','bg-surface',3],
 ['border-strong','bg-surface',3],['series-1','bg-surface',3],['series-2','bg-surface',3],['series-3','bg-surface',3],['series-bm','bg-surface',3],
 ...[1,2,3,4,5,6].map(i=>[`compare-${i}`,'bg-surface',3]),
];
console.log('| 쌍 | 기준 | 밝은 | 어두운(기본) |\n|---|---|---|---|');
for (const [a,b,min] of rows) { const l=contrast(L[a],L[b]), d=contrast(D[a],D[b]); console.log(`| \`${a}\` / \`${b}\` | ${min}:1 | ${f(l)}${l<min?' ✗':''} | ${f(d)}${d<min?' ✗':''} |`); }
console.log('dark div text-1:', ['div-n3','div-n2','div-n1','div-0','div-p1','div-p2','div-p3'].map(k=>k+' '+f(contrast(D['text-1'],D[k]))).join(', '));
console.log('dark global div text-1:', ['div-p1','div-p2','div-p3'].map(k=>k+' '+f(contrast(G['text-1'],G[k]))).join(', '), 'up on surface', f(contrast(G.up,G['bg-surface'])), 'down', f(contrast(G.down,G['bg-surface'])));
