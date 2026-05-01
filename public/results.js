const socket = io();

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const waitingScreen = document.getElementById('waiting-screen');
const bubbleChart = document.getElementById('bubble-chart');
const resultsQuestion = document.getElementById('results-question');

socket.on('connect', () => {
  statusDot.className = 'status-dot connected';
  statusText.textContent = 'Live';
});

socket.on('disconnect', () => {
  statusDot.className = 'status-dot disconnected';
  statusText.textContent = 'Disconnected';
});

socket.on('state:waiting', () => {
  resultsQuestion.style.display = 'none';
  showWaiting();
});

socket.on('state:question', (data) => {
  resultsQuestion.textContent = data.text;
  resultsQuestion.style.display = '';
  if (!data.revealed) {
    showWaiting();
    clearBubbles();
  }
});

socket.on('state:results', (data) => {
  showChart();
  renderBubbles(data.answers);
});

function showWaiting() {
  waitingScreen.style.display = '';
  bubbleChart.style.display = 'none';
}

function showChart() {
  waitingScreen.style.display = 'none';
  bubbleChart.style.display = '';
}

// D3 Bubble Chart
// Each color: { base, light (highlight), dark (shadow) }
const COLORS = [
  { base: '#b4a7f5', light: '#ddd8fb', dark: '#7c6af7' },
  { base: '#f4a8d0', light: '#fad4e8', dark: '#e879ac' },
  { base: '#6edebe', light: '#a8f0d8', dark: '#2cb888' },
  { base: '#fdba8a', light: '#fed8b8', dark: '#f97316' },
  { base: '#93c5fd', light: '#bfdbfe', dark: '#3b82f6' },
  { base: '#d8b4fe', light: '#ede9fe', dark: '#a855f7' },
  { base: '#fde68a', light: '#fef3c7', dark: '#ca8a04' },
  { base: '#fca5a5', light: '#fee2e2', dark: '#ef4444' },
];

// Radii are computed dynamically from SVG dimensions in renderBubbles

let simulation = null;
let svg = null;
let width = 0;
let height = 0;

function initSvg() {
  svg = d3.select('#bubble-chart');

  const defs = svg.append('defs');

  // Outer glow filter for all bubbles
  const filter = defs.append('filter')
    .attr('id', 'bubble-glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  filter.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', '7')
    .attr('result', 'blur');
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'blur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Sharper inner glow for winner
  const winFilter = defs.append('filter')
    .attr('id', 'winner-glow')
    .attr('x', '-60%').attr('y', '-60%')
    .attr('width', '220%').attr('height', '220%');
  winFilter.append('feGaussianBlur')
    .attr('in', 'SourceGraphic')
    .attr('stdDeviation', '12')
    .attr('result', 'blur');
  const winMerge = winFilter.append('feMerge');
  winMerge.append('feMergeNode').attr('in', 'blur');
  winMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Radial gradient per color — sphere shading (highlight top-left → deep bottom-right)
  COLORS.forEach((c, i) => {
    const grad = defs.append('radialGradient')
      .attr('id', `bgrad-${i}`)
      .attr('cx', '35%').attr('cy', '28%').attr('r', '68%')
      .attr('fx', '35%').attr('fy', '28%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', c.light);
    grad.append('stop').attr('offset', '55%').attr('stop-color', c.base);
    grad.append('stop').attr('offset', '100%').attr('stop-color', c.dark);
  });

  // Light gold gradient for winner bubble
  const winGrad = defs.append('radialGradient')
    .attr('id', 'bgrad-win')
    .attr('cx', '35%').attr('cy', '28%').attr('r', '68%')
    .attr('fx', '35%').attr('fy', '28%');
  winGrad.append('stop').attr('offset', '0%').attr('stop-color', '#fffff0');
  winGrad.append('stop').attr('offset', '55%').attr('stop-color', '#fef3c7');
  winGrad.append('stop').attr('offset', '100%').attr('stop-color', '#fde68a');

  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  width = bubbleChart.clientWidth;
  height = bubbleChart.clientHeight;
  if (svg) {
    svg.attr('width', width).attr('height', height);
    if (simulation) simulation.force('center', d3.forceCenter(width / 2, height / 2)).alpha(0.3).restart();
  }
}

// Word-wrap text and scale font so it always fits inside the bubble circle
function setTextInBubble(gNode, d) {
  const g = d3.select(gNode);
  g.selectAll('text').remove();

  const r = d.r;
  const isWinner = d.rank === 0;
  const maxW = r * 1.5;          // usable chord width at bubble center
  const words = d.text.split(/\s+/);

  function buildLines(fs) {
    const charW = fs * 0.55;     // average char width estimate
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (test.length * charW > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  let fontSize = Math.min(r * 0.45, 24);
  let lines = buildLines(fontSize);

  // Scale down if the text block is too tall for the bubble
  const blockH = lines.length * fontSize * 1.25;
  if (blockH > r * 1.3) {
    fontSize *= (r * 1.3) / blockH;
    lines = buildLines(fontSize);
  }

  // Scale down if the longest line is still too wide
  const longest = lines.reduce((m, l) => l.length > m.length ? l : m, '');
  const longestW = longest.length * fontSize * 0.55;
  if (longestW > maxW) {
    fontSize *= maxW / longestW;
    lines = buildLines(fontSize);
  }

  fontSize = Math.max(fontSize, 8);
  const lineH = fontSize * 1.25;
  const totalH = lines.length * lineH;
  const countFs = Math.max(8, Math.min(fontSize * 0.72, 14));
  const nameStartY = -totalH / 2 + lineH * 0.35;
  const countY = totalH / 2 + countFs * 1.3;

  const nameEl = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('fill', isWinner ? '#1a1a00' : '#2d2060')
    .attr('font-family', 'Inter, system-ui, sans-serif')
    .attr('font-weight', '800')
    .attr('font-size', fontSize + 'px')
    .attr('paint-order', 'stroke')
    .attr('stroke', isWinner ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.6)')
    .attr('stroke-width', '1.5px')
    .attr('stroke-linejoin', 'round')
    .style('pointer-events', 'none');

  lines.forEach((line, i) => {
    nameEl.append('tspan')
      .attr('x', 0)
      .attr('y', nameStartY + i * lineH)
      .text(line);
  });

  // Only show vote count if bubble is large enough
  if (r > 28 && countY + countFs * 0.5 < r * 0.95) {
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', countY)
      .attr('fill', isWinner ? 'rgba(26,16,0,0.7)' : 'rgba(45,32,96,0.75)')
      .attr('font-family', 'Inter, system-ui, sans-serif')
      .attr('font-size', countFs + 'px')
      .attr('paint-order', 'stroke')
      .attr('stroke', isWinner ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.35)')
      .attr('stroke-width', '1px')
      .attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none')
      .text(d.count + (d.count === 1 ? ' vote' : ' votes'));
  }
}

function clearBubbles() {
  if (!svg) return;
  svg.selectAll('.bubble-group').remove();
  if (simulation) simulation.stop();
}

function renderBubbles(answers) {
  if (!svg) initSvg();

  width = bubbleChart.clientWidth;
  height = bubbleChart.clientHeight;
  svg.attr('width', width).attr('height', height);

  const entries = Object.entries(answers).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    clearBubbles();
    return;
  }

  const maxCount = Math.max(...entries.map(e => e[1]));

  // Scale bubble radii to the viewport so they fill the screen on any device
  const maxR = Math.min(width, height) * 0.18;
  const minR = Math.max(18, Math.min(width, height) * 0.055);

  const nodes = entries.map(([text, count], i) => {
    const r = Math.max(minR, maxR * Math.sqrt(count / maxCount));
    return { id: text, text, count, r, colorIdx: i % COLORS.length, rank: i };
  });

  if (simulation) simulation.stop();

  simulation = d3.forceSimulation(nodes)
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(d => d.r + 7).strength(0.9))
    .force('charge', d3.forceManyBody().strength(20))
    .on('tick', ticked);

  // Data join
  const groups = svg.selectAll('.bubble-group')
    .data(nodes, d => d.id);

  // Exit
  groups.exit()
    .transition().duration(300)
    .attr('opacity', 0)
    .remove();

  // Enter
  const enter = groups.enter()
    .append('g')
    .attr('class', 'bubble-group')
    .attr('opacity', 0)
    .attr('transform', `translate(${width / 2},${height / 2})`);

  enter.append('circle')
    .attr('r', 0)
    .attr('fill', d => d.rank === 0 ? 'url(#bgrad-win)' : `url(#bgrad-${d.colorIdx})`)
    .attr('filter', d => d.rank === 0 ? 'url(#winner-glow)' : 'url(#bubble-glow)')
    .attr('stroke', d => d.rank === 0 ? '#f59e0b' : COLORS[d.colorIdx].light)
    .attr('stroke-width', d => d.rank === 0 ? 2.5 : 1.5)
    .attr('stroke-opacity', d => d.rank === 0 ? 0.7 : 0.6);

  // Merge and animate
  const merged = enter.merge(groups);

  merged.transition().duration(500)
    .attr('opacity', 1);

  merged.select('circle')
    .transition().duration(750)
    .ease(d3.easeElasticOut.amplitude(1).period(0.45))
    .attr('r', d => d.r);

  // Set word-wrapped, size-fitted text on each bubble
  merged.each(function(d) { setTextInBubble(this, d); });

  function ticked() {
    svg.selectAll('.bubble-group')
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }
}

initSvg();

// QR code for the poll URL
(function() {
  const pollUrl = window.location.origin + '/';
  document.getElementById('qr-url').textContent = pollUrl;
  new QRCode(document.getElementById('qr-code'), {
    text: pollUrl,
    width: 300,
    height: 300,
    colorDark: '#ffffff',
    colorLight: '#0d0d18',
    correctLevel: QRCode.CorrectLevel.M,
  });
})();
