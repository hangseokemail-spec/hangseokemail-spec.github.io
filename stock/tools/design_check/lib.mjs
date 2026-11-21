export const hex2srgb = (h) => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255); };
const s2lin = (c) => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const lin2s = (c) => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92*c : 1.055*c**(1/2.4) - 0.055; };
export const lin = (h) => hex2srgb(h).map(s2lin);
export const relLum = (h) => { const [r,g,b] = lin(h); return 0.2126*r + 0.7152*g + 0.0722*b; };
export const contrast = (a,b) => { const [hi,lo] = [relLum(a), relLum(b)].sort((x,y)=>y-x); return (hi+0.05)/(lo+0.05); };
export function oklabFromLin([r,g,b]) {
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s, 1.9779984951*l - 2.4285922050*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.8086757660*s];
}
export function linFromOklab([L,a,b]) {
  const l_ = L + 0.3963377774*a + 0.2158037573*b, m_ = L - 0.1055613458*a - 0.0638541728*b, s_ = L - 0.0894841775*a - 1.2914855480*b;
  const l = l_**3, m = m_**3, s = s_**3;
  return [4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s];
}
export const oklab = (h) => oklabFromLin(lin(h));
export const oklch = (h) => { const [L,a,b] = oklab(h); let H = Math.atan2(b,a)*180/Math.PI; if (H<0) H+=360; return [L, Math.hypot(a,b), H]; };
const toHex = (rgb) => '#' + rgb.map(c => Math.round(lin2s(c)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
export function inGamut(L,C,H){ const a=C*Math.cos(H*Math.PI/180), b=C*Math.sin(H*Math.PI/180); return linFromOklab([L,a,b]).every(c=>c>=-1e-4&&c<=1+1e-4); }
export function fromOklch(L,C,H) { // reduce chroma until in gamut
  let c = C; while (c > 0 && !inGamut(L,c,H)) c -= 0.002; c = Math.max(0,c);
  const a=c*Math.cos(H*Math.PI/180), b=c*Math.sin(H*Math.PI/180); return toHex(linFromOklab([L,a,b]));
}
const MACHADO = {
  protan: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  deutan: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  tritan: [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
};
export function simulate(h, kind) { const [r,g,b] = lin(h), M = MACHADO[kind]; const cl = (c)=>Math.max(0,Math.min(1,c)); return M.map(row => cl(row[0]*r + row[1]*g + row[2]*b)); }
export function dE(h1,h2,kind) { const a = oklabFromLin(kind ? simulate(h1,kind) : lin(h1)); const b = oklabFromLin(kind ? simulate(h2,kind) : lin(h2)); return 100*Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }
export const cvd = (a,b) => Math.min(dE(a,b,'protan'), dE(a,b,'deutan'));
export const f = (x,d=2)=> x.toFixed(d);
