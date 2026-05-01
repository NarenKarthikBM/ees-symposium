const socket = io();

const waitingCard = document.getElementById('waiting-card');
const questionCard = document.getElementById('question-card');
const waitingMsg = document.getElementById('waiting-msg');
const questionText = document.getElementById('question-text');
const answerForm = document.getElementById('answer-form');
const submitBtn = document.getElementById('submit-btn');
const submittedState = document.getElementById('submitted-state');
const nameSearch = document.getElementById('name-search');
const nameSelected = document.getElementById('name-selected');
const nameDropdown = document.getElementById('name-dropdown');
const profSelect = document.getElementById('prof-select');
const openInput = document.getElementById('open-input');

const FACULTY = [
  'Dr. Angana Chaudhuri',
  'Dr. Arundhuti Ghatak',
  'Dr. Ashis Biswas',
  'Dr. Ashwani Tiwari',
  'Dr. Dhanyalekshmi Pillai',
  'Dr. Jyotirmoy Mallik',
  'Dr. Kumar Gaurav',
  'Dr. Pankaj Kumar',
  'Dr. Pritam Nasipuri',
  'Dr. Ramya Sunder Raman',
  'Dr. Sanjeev Kumar Jha',
  'Dr. Satinder Pal Singh',
  'Dr. Shubhi Agrawal',
  'Dr. Somil Swarnkar',
  'Dr. Vinee Srivastava',
];

let currentQuestionId = null;
let currentQuestionType = 'open';
let hasVoted = false;
let selectedName = null;

function renderDropdown(query) {
  const q = query.trim().toLowerCase();
  const matches = q ? FACULTY.filter(n => n.toLowerCase().includes(q)) : FACULTY;
  nameDropdown.innerHTML = '';
  matches.forEach(name => {
    const item = document.createElement('div');
    item.className = 'name-dropdown-item';
    item.textContent = name;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent input blur before click registers
      selectName(name);
    });
    nameDropdown.appendChild(item);
  });
  nameDropdown.style.display = matches.length ? '' : 'none';
}

function selectName(name) {
  selectedName = name;
  nameSearch.value = '';
  nameSearch.style.display = 'none';
  nameDropdown.style.display = 'none';
  nameSelected.textContent = name;
  nameSelected.style.display = '';
  submitBtn.disabled = false;
}

function resetSelection() {
  selectedName = null;
  nameSearch.value = '';
  nameSearch.style.display = '';
  nameSelected.style.display = 'none';
  nameDropdown.style.display = 'none';
  openInput.value = '';
  submitBtn.disabled = true;
}

nameSearch.addEventListener('input', () => renderDropdown(nameSearch.value));
nameSearch.addEventListener('focus', () => renderDropdown(nameSearch.value));
nameSearch.addEventListener('blur', () => {
  setTimeout(() => { nameDropdown.style.display = 'none'; }, 150);
});

openInput.addEventListener('input', () => {
  submitBtn.disabled = openInput.value.trim() === '';
});
openInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !submitBtn.disabled) submitAnswer();
});

nameSelected.addEventListener('click', () => {
  if (hasVoted) return;
  resetSelection();
  nameSearch.focus();
});

function showWaiting(msg) {
  waitingMsg.textContent = msg || 'Waiting for the host to start...';
  waitingCard.style.display = '';
  questionCard.style.display = 'none';
}

function showQuestion(data) {
  const newQuestion = data.id !== currentQuestionId;
  currentQuestionId = data.id;
  currentQuestionType = data.type || 'open';

  if (newQuestion) {
    hasVoted = false;
    resetSelection();
    answerForm.style.display = '';
    submittedState.style.display = 'none';

    // Switch input mode based on question type
    if (currentQuestionType === 'professor') {
      profSelect.style.display = '';
      openInput.style.display = 'none';
    } else {
      profSelect.style.display = 'none';
      openInput.style.display = '';
    }
  }

  questionText.textContent = data.text;
  waitingCard.style.display = 'none';
  questionCard.style.display = '';

  if (data.revealed && !hasVoted) {
    answerForm.style.display = 'none';
    submittedState.style.display = '';
    submittedState.querySelector('p').textContent = 'Results are live!';
  }
}

function submitAnswer() {
  if (hasVoted) return;
  let answer;
  if (currentQuestionType === 'professor') {
    if (!selectedName) return;
    answer = selectedName;
  } else {
    answer = openInput.value.trim();
    if (!answer) return;
  }
  socket.emit('vote:submit', { answer });
}

socket.on('state:waiting', (data) => {
  currentQuestionId = null;
  hasVoted = false;
  showWaiting(data.message);
});

socket.on('state:question', (data) => {
  showQuestion(data);
});

socket.on('state:results', () => {
  // Results revealed — update submitted state text
  if (hasVoted) {
    submittedState.querySelector('p').textContent = 'Results are live!';
  }
});

socket.on('vote:accepted', () => {
  hasVoted = true;
  answerForm.style.display = 'none';
  submittedState.style.display = '';
  submittedState.querySelector('p').textContent = 'Answer submitted! Waiting for results...';
});
