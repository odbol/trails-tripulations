import * as d3 from 'd3';

const GAP_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2-day gap = new cluster

const BAR_H       = 32;   // height of the bar itself
const PAD         = { top: 0, right: 200, bottom: 88, left: 16 };

const SEG_COLORS = d3.schemeTableau10;

const fmtDate  = d3.timeFormat('%-m/%-d/%Y %-I:%M%p');
const fmtShort = d3.timeFormat('%-m/%-d/%Y');
const fmtLatLon = d => (d.lat && d.lon)
  ? `${d.lat.toFixed(3)}, ${d.lon.toFixed(3)}`
  : null;

const labelColor = '#575757';

// -------------------------------------------------------------------
async function main() {
  const raw = await fetch('./travels-clustered.json').then(r => r.json());
  // const entries = raw
  //   .filter(d => d.category === '🚗')
  //   .sort((a, b) => a.created - b.created);

  // // ── Cluster: split on gaps > threshold ──────────────────────────
  // const clusters = [];
  // let cur = [entries[0]];
  // for (let i = 1; i < entries.length; i++) {
  //   if (entries[i].created - entries[i - 1].created > GAP_THRESHOLD_MS) {
  //     clusters.push(cur);
  //     cur = [];
  //   }
  //   cur.push(entries[i]);
  // }
  // clusters.push(cur);

  const clusters = raw;

  document.getElementById('subtitle').textContent =
    `${clusters.length} clusters (≤2-day gap)`;

  const container = document.getElementById('chart-container');
  const tooltip = document.getElementById('tooltip');

  // ── Tooltip helpers ─────────────────────────────────────────────
  function addTooltipHandlers(sel, htmlFn) {
    sel
      .style('cursor', 'pointer')
      .on('mousemove', (event) => {
        tooltip.style.display = 'block';
        tooltip.style.left  = (event.clientX + 16) + 'px';
        tooltip.style.top   = (event.clientY - 12) + 'px';
        tooltip.innerHTML   = htmlFn();
      })
      .on('mouseleave', () => { tooltip.style.display = 'none'; });
  }

  function tipHtml(d) {
    return `
      <strong>${fmtDate(new Date(d.created))}</strong>
      ${d.label ? `<div>${d.label}</div>` : ''}
      ${d.notes ? `<div>${d.notes}</div>` : ''}
      ${fmtLatLon(d) ? `<div class="coord">${fmtLatLon(d)}</div>` : ''}
    `;
  }

  // ── Draw a single cluster card ──────────────────────────────────
  function drawCard(cardNode, cl, ci) {
    // Clear previous SVG content
    const existingSvg = cardNode.querySelector('svg');
    if (existingSvg) existingSvg.remove();

    const svgW = cardNode.clientWidth - 48; // account for card padding (24px each side)
    const BAR_WIDTH = svgW - PAD.left - PAD.right;
    const svgH = BAR_H + PAD.bottom;

    const svg = d3.select(cardNode).append('svg')
      .attr('width', svgW)
      .attr('height', svgH);

    const barX = PAD.left;
    const timeline = cl.timeline;

    const clStart = timeline[0].created;
    const clEnd   = timeline[timeline.length - 1].created;
    const clSpan  = Math.max(clEnd - clStart, 1); // ms

    // x maps timestamp → pixel within the bar
    const x = d3.scaleLinear()
      .domain([clStart, clEnd])
      .range([barX, barX + BAR_WIDTH]);

    const g = svg.append('g');

    // ── Draw bar segments (one per gap between consecutive entries) ─
    // Background track
    g.append('rect')
      .attr('x', barX)
      .attr('y', 0)
      .attr('width', BAR_WIDTH)
      .attr('height', BAR_H)
      .attr('fill', '#1a1d28')
      .attr('rx', 4);

    // For single-entry clusters: show a single pill + label
    if (timeline.length === 1) {
      const d = timeline[0];
      const pill = g.append('rect')
        .attr('x', barX)
        .attr('y', 0)
        .attr('width', 24)
        .attr('height', BAR_H)
        .attr('fill', SEG_COLORS[0])
        .attr('rx', 4);

      const label = [d.notes, fmtLatLon(d)].filter(Boolean).join(' · ');
      g.append('text')
        .attr('x', barX + 32)
        .attr('y', BAR_H / 2)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#bbb')
        .text(label.slice(0, 80));

      addTooltipHandlers(pill, () => tipHtml(d));
      return;
    }

    // Multi-entry: one rect per gap
    timeline.forEach((d, i) => {
      if (i === timeline.length - 1) return; // last entry is an endpoint only
      const next = timeline[i + 1];

      const sx = x(d.created);
      const ex = x(next.created);
      const sw = Math.max(ex - sx, 1);
      const color = SEG_COLORS[i % SEG_COLORS.length];

      const isFirst = i === 0;
      const isLast  = i === timeline.length - 2;

      // Use clipPath per segment for clean rounded ends
      const clipId = `clip-${ci}-${i}`;
      const clipRect = g.append('clipPath').attr('id', clipId)
        .append('rect')
        .attr('x', sx)
        .attr('y', 0)
        .attr('width', sw)
        .attr('height', BAR_H);
      if (isFirst) clipRect.attr('rx', 4);
      if (isLast)  clipRect.attr('rx', 4);

      const seg = g.append('rect')
        .attr('x', sx + (isFirst ? 0 : 0.5))   // hairline gap between segments
        .attr('y', 0)
        .attr('width', sw - (isFirst || isLast ? 0 : 0.5))
        .attr('height', BAR_H)
        .attr('fill', color)
        .attr('clip-path', `url(#${clipId})`);

      // ── Duration & note label inside the segment ─────────────────
      const durMs = next.created - d.created;
      const durH  = durMs / 3_600_000;
      const durLabel = durH >= 48  ? `${(durH / 24).toFixed(1)}d`
                     : durH >= 1   ? `${durH.toFixed(1)}h`
                     :               `${Math.round(durMs / 60000)}m`;

      const noteText   = d.notes || '';
      const labelText  = d.label || '';
      const innerLabel = [durLabel, labelText].filter(Boolean).join(' · ');

      if (sw > 40) {
        // clip text to segment width
        const textClipId = `tclip-${ci}-${i}`;
        g.append('clipPath').attr('id', textClipId)
          .append('rect')
          .attr('x', sx + 5)
          .attr('y', 0)
          .attr('width', sw - 10)
          .attr('height', BAR_H);

        g.append('text')
          .attr('x', sx + 6)
          .attr('y', BAR_H / 2)
          .attr('dominant-baseline', 'middle')
          .attr('font-size', 10)
          .attr('fill', 'rgba(0,0,0,0.75)')
          .attr('pointer-events', 'none')
          .attr('clip-path', `url(#${textClipId})`)
          .text(innerLabel);
      }

      // ── Entry marker tick at the START of segment ─────────────────
      g.append('line')
        .attr('x1', sx).attr('x2', sx)
        .attr('y1', BAR_H).attr('y2', BAR_H + 6)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.6);

      // ── Label below the tick (notes + lat/lon) ───────────────────
      const belowLabel = [noteText].filter(Boolean).join(' ');
      if (belowLabel) {
        g.append('text')
          .attr('x', sx)
          .attr('y', BAR_H + 8)
          .attr('font-size', 9.5)
          .attr('fill', labelColor)
          .attr('pointer-events', 'none')
          .attr('transform', `rotate(30, ${sx}, ${BAR_H + 8})`)
          .text(belowLabel.slice(0, 40));
      }

      // Tooltip on segment hover
      addTooltipHandlers(seg, () => `
        <strong>${fmtDate(new Date(d.created))}</strong>
        ${d.notes ? `<div>${d.notes}</div>` : ''}
        ${fmtLatLon(d) ? `<div class="coord">${fmtLatLon(d)}</div>` : ''}
        <div class="dur">▸ ${d.label} ${durLabel} ▸</div>
        <strong>${fmtDate(new Date(next.created))}</strong>
        ${next.notes ? `<div>${next.notes}</div>` : ''}
        ${fmtLatLon(next) ? `<div class="coord">${fmtLatLon(next)}</div>` : ''}
      `);
    });

    // ── Final entry tick + label at the right edge ─────────────────
    const last = timeline[timeline.length - 1];
    const lastX = x(last.created);

    g.append('line')
      .attr('x1', lastX).attr('x2', lastX)
      .attr('y1', 0).attr('y2', BAR_H + 6)
      .attr('stroke', '#555')
      .attr('stroke-width', 1.5);

    const lastLabel = [last.notes].filter(Boolean).join(' · ');
    if (lastLabel) {
      g.append('text')
        .attr('x', lastX)
        .attr('y', BAR_H + 8)
        .attr('font-size', 9.5)
        .attr('fill', labelColor)
        .attr('pointer-events', 'none')
        .attr('transform', `rotate(30, ${lastX}, ${BAR_H + 8})`)
        .text(lastLabel.slice(0, 40));
    }

    // Total span label to the right of bar
    const totalH = clSpan / 3_600_000;
    const totalLabel = totalH >= 48 ? `${(totalH / 24).toFixed(1)}d`
                     : totalH >= 1  ? `${totalH.toFixed(1)}h`
                     :                `${Math.round(clSpan / 60000)}m`;

    g.append('text')
      .attr('x', barX + BAR_WIDTH + 8)
      .attr('y', BAR_H / 2)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#444')
      .text(totalLabel);
  }

  // ── Build cards and draw ────────────────────────────────────────
  const cardNodes = [];

  clusters.forEach((cl, ci) => {
    const card = d3.select(container)
      .append('div')
      .attr('class', 'cluster-card');

    const cardNode = card.node();
    cardNodes.push({ cardNode, cl, ci });

    const timeline = cl.timeline;
    const clStart = timeline[0].created;
    const clEnd   = timeline[timeline.length - 1].created;

    // ── Cluster title & date (rendered as HTML in the card header) ──
    const dateRange = timeline.length > 1
      ? `${fmtShort(new Date(clStart))} – ${fmtShort(new Date(clEnd))}`
      : fmtShort(new Date(clStart));

    const header = document.createElement('div');
    header.className = 'card-header';

    if (cl.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'card-title';
      titleEl.textContent = cl.title;
      header.appendChild(titleEl);
    }

    const dateEl = document.createElement('span');
    dateEl.className = 'card-date';
    dateEl.textContent = dateRange;
    header.appendChild(dateEl);

    const countEl = document.createElement('span');
    countEl.className = 'card-count';
    countEl.textContent = `${timeline.length} entries`;
    header.appendChild(countEl);

    cardNode.appendChild(header);

    drawCard(cardNode, cl, ci);
  });

  // ── Redraw on resize (debounced) ────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cardNodes.forEach(({ cardNode, cl, ci }) => drawCard(cardNode, cl, ci));
    }, 150);
  });
}

main().catch(err => {
  console.error(err);
  document.getElementById('subtitle').textContent = 'Error: ' + err.message;
});
