// ECharts 도우미 — 색은 CSS 변수에서 읽어 라이트/다크를 함께 따릅니다.
import { fmtPct, fmtMoneyShort, fmtMoney, esc } from './format.js';

const charts = new Set();
export const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export const seriesColor = (i) => css(i === 'bm' ? '--series-bm' : `--series-${i + 1}`);
export const catColor = (i) => (i >= 8 ? css('--cat-x') : css(`--cat-${i + 1}`));

function base() {
  return {
    animationDuration: 350, animationDurationUpdate: 200,
    textStyle: { fontFamily: css('--font') || 'sans-serif', color: css('--text-2') },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
  };
}
function axisCommon() {
  return {
    axisLine: { show: false }, axisTick: { show: false },
    axisLabel: { color: css('--text-3'), fontSize: 12 },
    splitLine: { show: true, lineStyle: { color: css('--border'), width: 1 } },
  };
}

export function mount(elm) {
  if (!window.echarts) { elm.innerHTML = '<p class="cap">차트 도구를 불러오지 못했어요. 표로 보기를 눌러 주세요.</p>'; return null; }
  let c = window.echarts.getInstanceByDom(elm);
  if (!c) { c = window.echarts.init(elm, null, { renderer: 'canvas' }); charts.add(c); new ResizeObserver(() => c.resize()).observe(elm); }
  return c;
}
window.addEventListener('themechange', () => charts.forEach((c) => c.__redraw?.()));

/** 값 읽기 줄(휴대폰): 축 포인터가 움직이면 readout에 날짜·값 표시 */
function bindReadout(c, readout, fmt, xFmt = null) {
  if (!readout) return;
  c.off('updateAxisPointer');
  c.on('updateAxisPointer', (ev) => {
    const ax = ev.axesInfo?.[0];
    if (!ax) return;
    const opt = c.getOption();
    const x = ax.value;
    const parts = [];
    opt.series.forEach((s) => {
      if (s.tooltipHide) return;
      let d = s.data.find((p) => (Array.isArray(p) ? p[0] : p.value?.[0]) === x);
      if (d == null && typeof x === 'number' && s.data.length && Array.isArray(s.data[0])) { let best = null, bd = Infinity; for (const p of s.data) { const dd = Math.abs(p[0] - x); if (dd < bd) { bd = dd; best = p; } } d = best; }
      if (d == null) d = s.data[x];
      const v = Array.isArray(d) ? d[1] : d?.value?.[1] ?? d;
      if (v != null && typeof v === 'number') parts.push(`<b>${esc(fmt(v))}</b> <span class="faint">${esc(s.name)}</span>`);
    });
    const xs = xFmt ? xFmt(x) : typeof x === 'number' && x > 1e11 ? new Date(x).toISOString().slice(0, 10).replace(/-/g, '.') : x;
    readout.innerHTML = `${esc(xs)} &nbsp; ${parts.join(' &nbsp; ')}`;
  });
}

function tooltipFmt(fmt, isTime) {
  return (ps) => {
    const arr = Array.isArray(ps) ? ps : [ps];
    if (!arr.length) return '';
    const x = arr[0].axisValue ?? arr[0].value?.[0];
    const head = isTime ? new Date(x).toISOString().slice(0, 10).replace(/-/g, '.') : x;
    return `<div style="font-size:12px;color:${css('--text-3')}">${esc(head)}</div>` + arr.filter((p) => !p.seriesName.startsWith('_')).map((p) => {
      const v = Array.isArray(p.value) ? p.value[1] : p.value;
      return `<div style="display:flex;gap:8px;align-items:center"><span style="width:10px;height:3px;background:${p.color};display:inline-block"></span><b style="font-variant-numeric:tabular-nums">${esc(fmt(v))}</b><span style="color:${css('--text-3')}">${esc(p.seriesName)}</span></div>`;
    }).join('');
  };
}
function tooltip(fmt, isTime) {
  return {
    trigger: 'axis', show: !isMobile(), confine: true, backgroundColor: css('--bg-surface'), borderColor: css('--border'),
    textStyle: { color: css('--text-1') }, extraCssText: `box-shadow:${css('--shadow-pop')};border-radius:8px;`,
    axisPointer: { type: 'line', lineStyle: { color: css('--text-3'), width: 1 } }, formatter: tooltipFmt(fmt, isTime),
  };
}

/**
 * 시계열 선 차트
 * series: [{name, data:[[ms, v]], color, dashed, area, width, step}]
 */
export function lineChart(elm, { series, yFmt = (v) => v, log = false, readout = null, yMin = null, yMax = null, markLine = null, isTime = true, xType = null, xFmt = null, grid = null, xMin = null, xMax = null }) {
  const c = mount(elm);
  if (!c) return null;
  const draw = () => {
    c.setOption({
      ...base(),
      tooltip: { ...tooltip(yFmt, isTime && !xType), formatter: xFmt ? ((ps) => tooltipFmt(yFmt, false)((Array.isArray(ps) ? ps : [ps]).map((p) => ({ ...p, axisValue: xFmt(p.axisValue ?? p.value?.[0]) })))) : tooltip(yFmt, isTime && !xType).formatter },
      grid: grid ? { ...base().grid, ...grid } : { ...base().grid, right: series.some((x) => x.endLabel) && !isMobile() ? (series.some((x) => x.endRich) ? 118 : 96) : 16 },
      xAxis: { type: xType || (isTime ? 'time' : 'category'), min: xMin ?? undefined, max: xMax ?? undefined, ...axisCommon(), splitLine: { show: false }, axisLabel: { color: css('--text-3'), fontSize: 12, hideOverlap: true, formatter: xFmt || (isTime ? { year: '{yyyy}', month: '{yy}.{MM}', day: '{MM}.{dd}' } : undefined) } },
      yAxis: { type: log ? 'log' : 'value', scale: !log && yMin == null, min: yMin ?? undefined, max: yMax ?? undefined, ...axisCommon(), axisLabel: { color: css('--text-3'), fontSize: 12, formatter: (v) => yFmt(v, true) } },
      series: series.map((s) => ({
        name: s.name, type: 'line', data: s.data, showSymbol: false, symbolSize: 8, sampling: 'lttb', step: s.step || false,
        lineStyle: { width: s.width ?? 2, color: s.color, type: s.dashed ? 'dashed' : 'solid' }, itemStyle: { color: s.color },
        areaStyle: s.area ? { color: s.color, opacity: s.areaOpacity ?? 0.12 } : undefined,
        emphasis: s.focus ? { focus: 'series', lineStyle: { width: (s.width ?? 2) + 1 } } : { disabled: true }, blur: s.focus ? { lineStyle: { opacity: 0.15 }, areaStyle: { opacity: 0.03 } } : undefined, z: s.z ?? 2, tooltipHide: s.tooltipHide, triggerLineEvent: !!s.focus,
        markLine: s.markLine, markPoint: s.markPoint, markArea: s.markArea,
        endLabel: s.endLabel ? { show: !isMobile(), formatter: s.endLabel, color: css('--text-2'), fontSize: 12, distance: 8, ...(s.endRich ? { rich: { n: { color: css('--text-3'), fontSize: 11, lineHeight: 15 }, v: { color: s.color, fontSize: 15, fontWeight: 700, lineHeight: 19 }, c: { color: css('--text-2'), fontSize: 11, lineHeight: 15 } } } : {}) } : undefined,
        labelLayout: s.endRich ? { moveOverlap: 'shiftY' } : undefined,
      })),
      ...(markLine || {}),
    }, true);
    bindReadout(c, readout, yFmt, xFmt);
  };
  c.__redraw = draw;
  draw();
  return c;
}

/** 묶음 막대(연도별 수익률 등). cats: ['2017',...], series:[{name, data:[v...], color}] */
export function barChart(elm, { cats, series, yFmt = (v) => fmtPct(v, 0), horizontal = false, readout = null, valueLabels = false }) {
  const c = mount(elm);
  if (!c) return null;
  const draw = () => {
    const cat = { type: 'category', data: cats, ...axisCommon(), splitLine: { show: false }, axisLabel: { color: css('--text-3'), fontSize: 12, hideOverlap: true } };
    const val = { type: 'value', ...axisCommon(), axisLabel: { color: css('--text-3'), fontSize: 12, formatter: (v) => yFmt(v, true) } };
    c.setOption({
      ...base(),
      tooltip: { ...tooltip(yFmt, false), axisPointer: { type: 'shadow', shadowStyle: { color: css('--bg-hover'), opacity: 0.6 } } },
      xAxis: horizontal ? val : cat, yAxis: horizontal ? { ...cat, inverse: true } : val,
      series: series.map((s) => ({
        name: s.name, type: 'bar', data: s.data, barMaxWidth: 24, barGap: '15%',
        itemStyle: { color: s.colorFn ? (p) => s.colorFn(p.value, p.dataIndex) : s.color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        label: valueLabels ? { show: true, position: horizontal ? 'right' : 'top', formatter: (p) => yFmt(p.value), color: css('--text-2'), fontSize: 11 } : undefined,
        emphasis: { disabled: true },
      })),
    }, true);
    bindReadout(c, readout, yFmt);
  };
  c.__redraw = draw; draw();
  return c;
}

/** 도넛(가운데 총액). items: [{name, value, color}] */
export function donut(elm, { items, center = '', centerSub = '', fmt = (v) => v }) {
  const c = mount(elm);
  if (!c) return null;
  const draw = () => {
    c.setOption({
      ...base(),
      tooltip: { trigger: 'item', show: true, confine: true, backgroundColor: css('--bg-surface'), borderColor: css('--border'), textStyle: { color: css('--text-1') }, formatter: (p) => `${esc(p.name)}<br><b>${esc(fmt(p.value))}</b> · ${p.percent.toFixed(1)}%` },
      title: { text: center, subtext: centerSub, left: 'center', top: 'center', textStyle: { color: css('--text-1'), fontSize: isMobile() ? 18 : 20, fontWeight: 700 }, subtextStyle: { color: css('--text-3'), fontSize: 12 }, itemGap: 4 },
      series: [{
        type: 'pie', radius: ['58%', '86%'], avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false },
        itemStyle: { borderColor: css('--bg-surface'), borderWidth: 2 }, emphasis: { scale: true, scaleSize: 4 },
        data: items.map((it) => ({ name: it.name, value: it.value, itemStyle: { color: it.color } })),
      }],
    }, true);
  };
  c.__redraw = draw; draw();
  return c;
}

/** 트리맵: groups [{name, children:[{name, value, change}]}] 색 = 등락 */
export function treemap(elm, { groups, fmt = (v) => v }) {
  const c = mount(elm);
  if (!c) return null;
  const draw = () => {
    const col = (ch) => {
      if (ch == null) return css('--div-0');
      const a = Math.abs(ch);
      const step = a >= 0.03 ? 3 : a >= 0.01 ? 2 : a >= 0.002 ? 1 : 0;
      if (!step) return css('--div-0');
      return css(`--div-${ch > 0 ? 'p' : 'n'}${step}`);
    };
    const txt = (ch) => (ch != null && Math.abs(ch) >= 0.03 ? '#fff' : css('--text-1'));
    c.setOption({
      ...base(),
      tooltip: { show: true, confine: true, backgroundColor: css('--bg-surface'), borderColor: css('--border'), textStyle: { color: css('--text-1') }, formatter: (p) => (p.data?.change !== undefined ? `${esc(p.name)}<br><b>${esc(fmt(p.value))}</b> · 오늘 ${fmtPct(p.data.change, 1, true)}` : esc(p.name)) },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%', top: 0, left: 0, right: 0, bottom: 0,
        upperLabel: { show: true, height: 20, color: css('--text-2'), fontSize: 11, backgroundColor: 'transparent' },
        itemStyle: { borderColor: css('--bg-surface'), borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderColor: css('--bg-surface'), borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } }, { itemStyle: { borderColor: css('--bg-sunken'), borderWidth: 2, gapWidth: 2 }, upperLabel: { show: true } }, {}],
        data: groups.map((g) => ({
          name: g.name, children: g.children.map((ch) => ({
            name: ch.name, value: ch.value, change: ch.change, itemStyle: { color: col(ch.change) },
            label: { show: true, color: txt(ch.change), fontSize: 13, fontWeight: 700, formatter: (p) => `${p.name}\n${ch.change == null ? '' : fmtPct(ch.change, 1, true)}`, lineHeight: 16 },
          })),
        })),
      }],
    }, true);
  };
  c.__redraw = draw; draw();
  return c;
}

export { fmtMoneyShort, fmtMoney };
