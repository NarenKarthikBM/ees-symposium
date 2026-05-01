const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const state = {
  questions: [],
  currentQuestionId: null,
  answers: {},       // { [questionId]: { [normalizedAnswer]: count } }
  revealed: false,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};

// socket.id -> questionId they voted on
const votes = {};

let nextQuestionId = 1;

function normalize(s, lowercase) {
  const t = s.trim();
  return lowercase ? t.toLowerCase() : t;
}

function verifyPassword(password) {
  return password === state.adminPassword;
}

function currentQuestion() {
  return state.questions.find(q => q.id === state.currentQuestionId) || null;
}

function answerCount() {
  if (!state.currentQuestionId) return 0;
  const bucket = state.answers[state.currentQuestionId] || {};
  return Object.values(bucket).reduce((sum, n) => sum + n, 0);
}

function broadcastQuestion() {
  const q = currentQuestion();
  if (!q) {
    io.emit('state:waiting', { message: 'Waiting for the host to start...' });
    return;
  }
  io.emit('state:question', {
    id: q.id,
    text: q.text,
    type: q.type || 'open',
    answerCount: answerCount(),
    revealed: state.revealed,
  });
  if (state.revealed) {
    broadcastResults();
  }
}

function broadcastResults() {
  if (!state.currentQuestionId) return;
  const bucket = state.answers[state.currentQuestionId] || {};
  io.emit('state:results', { answers: bucket });
}

function broadcastAnswerCount() {
  const q = currentQuestion();
  if (!q) return;
  io.emit('state:question', {
    id: q.id,
    text: q.text,
    type: q.type || 'open',
    answerCount: answerCount(),
    revealed: state.revealed,
  });
}

// REST: password check
app.post('/admin/auth', (req, res) => {
  const { password } = req.body;
  res.json({ ok: verifyPassword(password) });
});

// REST: full state dump (admin)
app.get('/admin/state', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (!verifyPassword(password)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    questions: state.questions,
    currentQuestionId: state.currentQuestionId,
    answers: state.answers,
    revealed: state.revealed,
  });
});

function broadcastPlayerCount() {
  io.emit('stats:players', { count: io.engine.clientsCount });
}

io.on('connection', (socket) => {
  broadcastPlayerCount();
  // Send current state to new client
  const q = currentQuestion();
  if (!q) {
    socket.emit('state:waiting', { message: 'Waiting for the host to start...' });
  } else {
    socket.emit('state:question', {
      id: q.id,
      text: q.text,
      type: q.type || 'open',
      answerCount: answerCount(),
      revealed: state.revealed,
    });
    if (state.revealed) {
      socket.emit('state:results', { answers: state.answers[state.currentQuestionId] || {} });
    }
  }

  // User submits an answer
  socket.on('vote:submit', ({ answer }) => {
    if (!state.currentQuestionId) return;
    if (!answer || typeof answer !== 'string') return;
    if (votes[socket.id] === state.currentQuestionId) return; // already voted

    const q = currentQuestion();
    const key = normalize(answer, q && q.type !== 'professor');
    if (!key) return;

    if (!state.answers[state.currentQuestionId]) {
      state.answers[state.currentQuestionId] = {};
    }
    const bucket = state.answers[state.currentQuestionId];
    bucket[key] = (bucket[key] || 0) + 1;
    votes[socket.id] = state.currentQuestionId;

    socket.emit('vote:accepted');
    broadcastAnswerCount();
    if (state.revealed) broadcastResults();
  });

  // Admin: add question
  socket.on('admin:addQuestion', ({ text, type, password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    if (!text || !text.trim()) return;
    const q = { id: nextQuestionId++, text: text.trim(), type: type === 'professor' ? 'professor' : 'open' };
    state.questions.push(q);
    io.emit('admin:questionList', state.questions);
  });

  // Admin: delete question
  socket.on('admin:deleteQuestion', ({ questionId, password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    state.questions = state.questions.filter(q => q.id !== questionId);
    if (state.currentQuestionId === questionId) {
      state.currentQuestionId = null;
      state.revealed = false;
      broadcastQuestion();
    }
    io.emit('admin:questionList', state.questions);
  });

  // Admin: set active question
  socket.on('admin:setQuestion', ({ questionId, password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    const q = state.questions.find(q => q.id === questionId);
    if (!q) return;
    state.currentQuestionId = questionId;
    state.revealed = false;
    // Clear votes for this socket session on question change
    for (const id in votes) {
      if (votes[id] === questionId) delete votes[id];
    }
    broadcastQuestion();
    io.emit('admin:questionList', state.questions);
  });

  // Admin: reveal results
  socket.on('admin:reveal', ({ password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    if (!state.currentQuestionId) return;
    state.revealed = true;
    broadcastQuestion();
  });

  // Admin: hide results
  socket.on('admin:hide', ({ password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    state.revealed = false;
    broadcastQuestion();
  });

  // Admin: reset answers for current question
  socket.on('admin:reset', ({ password }) => {
    if (!verifyPassword(password)) return socket.emit('admin:error', 'Unauthorized');
    if (!state.currentQuestionId) return;
    state.answers[state.currentQuestionId] = {};
    // Clear votes so everyone can vote again
    for (const id in votes) {
      if (votes[id] === state.currentQuestionId) delete votes[id];
    }
    state.revealed = false;
    broadcastQuestion();
  });

  socket.on('disconnect', () => {
    delete votes[socket.id];
    broadcastPlayerCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin password: ${state.adminPassword}`);
});
