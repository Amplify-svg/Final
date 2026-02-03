// public/script.js
const socket = io();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const authError = document.getElementById('auth-error');
const userDisplay = document.getElementById('current-user-display');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');

// --- Auth Functions ---
function getCredentials() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    return { username: u, password: p };
}

function register() {
    const creds = getCredentials();
    if (!creds.username || !creds.password) return alert("Please fill in both fields");
    socket.emit('register', creds);
}

function login() {
    const creds = getCredentials();
    if (!creds.username || !creds.password) return alert("Please fill in both fields");
    socket.emit('login', creds);
}

// --- Socket Listeners (Auth) ---
socket.on('registerResponse', (data) => {
    if (data.success) {
        authError.style.color = 'lightgreen';
        authError.innerText = data.message;
    } else {
        authError.style.color = '#ff6b6b';
        authError.innerText = data.message;
    }
});

socket.on('loginResponse', (data) => {
    if (data.success) {
        // Switch screens
        loginScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        userDisplay.innerText = data.username;
    } else {
        authError.style.color = '#ff6b6b';
        authError.innerText = data.message;
    }
});

// --- Chat Logic ---
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (msgInput.value) {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
    }
});

socket.on('message', (data) => {
    const div = document.createElement('div');
    div.classList.add('message');
    
    if (data.user === 'System') {
        div.classList.add('system-msg');
        div.innerText = data.text;
    } else {
        div.innerHTML = `<strong>${data.user}:</strong> ${data.text}`;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto scroll to bottom
});