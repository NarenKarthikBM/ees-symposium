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
  { base: '#7c6af7', light: '#a89fff', dark: '#3d2db3' },
  { base: '#ec4899', light: '#f472b6', dark: '#9d174d' },
  { base: '#10b981', light: '#34d399', dark: '#065f46' },
  { base: '#f97316', light: '#fb923c', dark: '#9a3412' },
  { base: '#3b82f6', light: '#60a5fa', dark: '#1e3a8a' },
  { base: '#a855f7', light: '#c084fc', dark: '#6b21a8' },
  { base: '#eab308', light: '#fbbf24', dark: '#854d0e' },
  { base: '#ef4444', light: '#f87171', dark: '#991b1b' },
];

const BASE_RADIUS = 40;
const MIN_RADIUS = 28;

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

  const nodes = entries.map(([text, count], i) => {
    const r = Math.max(MIN_RADIUS, BASE_RADIUS * Math.sqrt(count / maxCount) * 2.2);
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

  enter.append('text')
    .attr('class', 'bubble-label')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.15em')
    .attr('fill', d => d.rank === 0 ? '#1a1a00' : '#fff')
    .attr('font-family', 'Inter, system-ui, sans-serif')
    .attr('font-weight', '800')
    .attr('paint-order', 'stroke')
    .attr('stroke', d => d.rank === 0 ? 'rgba(251,191,36,0.3)' : 'rgba(0,0,0,0.4)')
    .attr('stroke-width', '2px')
    .attr('stroke-linejoin', 'round')
    .style('pointer-events', 'none');

  enter.append('text')
    .attr('class', 'bubble-count')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.1em')
    .attr('fill', d => d.rank === 0 ? 'rgba(26,16,0,0.75)' : 'rgba(255,255,255,0.8)')
    .attr('font-family', 'Inter, system-ui, sans-serif')
    .attr('paint-order', 'stroke')
    .attr('stroke', d => d.rank === 0 ? 'rgba(251,191,36,0.2)' : 'rgba(0,0,0,0.3)')
    .attr('stroke-width', '1.5px')
    .attr('stroke-linejoin', 'round')
    .style('pointer-events', 'none');

  // Merge and animate
  const merged = enter.merge(groups);

  merged.transition().duration(500)
    .attr('opacity', 1);

  merged.select('circle')
    .transition().duration(750)
    .ease(d3.easeElasticOut.amplitude(1).period(0.45))
    .attr('r', d => d.r);

  merged.each(function(d) {
    const g = d3.select(this);
    const label = g.select('.bubble-label');
    const countLabel = g.select('.bubble-count');

    const maxChars = Math.floor(d.r / 5.5);
    const displayText = d.text.length > maxChars ? d.text.slice(0, maxChars - 1) + '…' : d.text;
    const fontSize = Math.min(18, d.r / 2.8);

    label.attr('font-size', fontSize + 'px').text(displayText);
    countLabel.attr('font-size', Math.min(13, fontSize * 0.75) + 'px').text(d.count + (d.count === 1 ? ' vote' : ' votes'));
  });

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
