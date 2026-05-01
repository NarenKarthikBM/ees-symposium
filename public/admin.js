const socket = io();

let password = sessionStorage.getItem('adminPassword') || '';
let questions = [];
let currentQuestionId = null;
let isRevealed = false;

// Auth
const authOverlay = document.getElementById('auth-overlay');
const authInput = document.getElementById('auth-input');
const authError = document.getElementById('auth-error');
const adminLayout = document.getElementById('admin-layout');

async function authSubmit() {
  const pw = authInput.value;
  const res = await fetch('/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  const data = await res.json();
  if (data.ok) {
    password = pw;
    sessionStorage.setItem('adminPassword', pw);
    authOverlay.style.display = 'none';
    adminLayout.style.display = '';
    loadInitialState();
  } else {
    authError.style.display = '';
  }
}

authInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authSubmit(); });

async function loadInitialState() {
  const res = await fetch('/admin/state', {
    headers: { 'x-admin-password': password },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('adminPassword');
    authOverlay.style.display = '';
    adminLayout.style.display = 'none';
    return;
  }
  const data = await res.json();
  questions = data.questions;
  currentQuestionId = data.currentQuestionId;
  isRevealed = data.revealed;
  renderQuestionList();
  renderControls();
}

// Auto-login if password cached
if (password) {
  fetch('/admin/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(r => r.json()).then(data => {
    if (data.ok) {
      authOverlay.style.display = 'none';
      adminLayout.style.display = '';
      loadInitialState();
    } else {
      sessionStorage.removeItem('adminPassword');
      password = '';
    }
  });
}

// Socket events
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

socket.on('connect', () => {
  statusDot.className = 'status-dot connected';
  statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
  statusDot.className = 'status-dot disconnected';
  statusText.textContent = 'Disconnected';
});

socket.on('state:question', (data) => {
  currentQuestionId = data.id;
  isRevealed = data.revealed;
  document.getElementById('answer-count').textContent = data.answerCount;
  updateRevealBadge();
});

socket.on('state:waiting', () => {
  currentQuestionId = null;
  isRevealed = false;
  renderControls();
});

socket.on('admin:questionList', (list) => {
  questions = list;
  renderQuestionList();
  renderControls();
});

socket.on('admin:error', (msg) => {
  alert('Error: ' + msg);
});

socket.on('stats:players', (data) => {
  const el = document.getElementById('player-count');
  if (el) el.textContent = data.count;
});

// Render
function renderQuestionList() {
  const list = document.getElementById('question-list');
  list.innerHTML = '';
  if (questions.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 4px;">No questions yet.</div>';
    return;
  }
  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'question-item' + (q.id === currentQuestionId ? ' active' : '');
    const num = String(i + 1).padStart(2, '0');
    const typeLabel = q.type === 'professor' ? 'Prof' : 'Open';
    const typeClass = q.type === 'professor' ? 'professor' : 'open';
    item.innerHTML = `
      <span class="q-num">${num}</span>
      <div class="q-body">
        <span class="question-item-text">${escHtml(q.text)}</span>
        <div class="q-meta">
          <span class="q-type-badge q-type-${typeClass}">${typeLabel}</span>
        </div>
      </div>
      <button class="question-item-del" title="Delete" onclick="deleteQuestion(${q.id}, event)">×</button>
    `;
    item.addEventListener('click', () => setQuestion(q.id));
    list.appendChild(item);
  });
}

function renderControls() {
  const noQ = document.getElementById('no-question');
  const controls = document.getElementById('question-controls');
  const q = questions.find(q => q.id === currentQuestionId);
  if (!q) {
    noQ.style.display = '';
    controls.style.display = 'none';
    return;
  }
  noQ.style.display = 'none';
  controls.style.display = '';
  document.getElementById('current-q-text').textContent = q.text;
  updateRevealBadge();
}

function updateRevealBadge() {
  const badge = document.getElementById('reveal-badge');
  const revealBtn = document.getElementById('reveal-btn');
  const hideBtn = document.getElementById('hide-btn');
  if (isRevealed) {
    badge.textContent = 'Revealed';
    badge.className = 'revealed-badge shown';
    revealBtn.disabled = true;
    hideBtn.disabled = false;
  } else {
    badge.textContent = 'Hidden';
    badge.className = 'revealed-badge hidden';
    revealBtn.disabled = false;
    hideBtn.disabled = true;
  }
}

// Actions
function addQuestion() {
  const input = document.getElementById('new-question-input');
  const text = input.value.trim();
  if (!text) return;
  const type = document.getElementById('prof-toggle').checked ? 'professor' : 'open';
  socket.emit('admin:addQuestion', { text, type, password });
  input.value = '';
  document.getElementById('prof-toggle').checked = false;
}

document.getElementById('new-question-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addQuestion();
});

function deleteQuestion(id, e) {
  e.stopPropagation();
  socket.emit('admin:deleteQuestion', { questionId: id, password });
}

function setQuestion(id) {
  currentQuestionId = id;
  isRevealed = false;
  renderQuestionList();
  renderControls();
  socket.emit('admin:setQuestion', { questionId: id, password });
}

function reveal() {
  socket.emit('admin:reveal', { password });
  isRevealed = true;
  updateRevealBadge();
}

function hide() {
  socket.emit('admin:hide', { password });
  isRevealed = false;
  updateRevealBadge();
}

function resetVotes() {
  if (!confirm('Reset all votes for this question?')) return;
  socket.emit('admin:reset', { password });
  isRevealed = false;
  document.getElementById('answer-count').textContent = '0';
  updateRevealBadge();
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
