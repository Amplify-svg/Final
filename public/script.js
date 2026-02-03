const socket = io();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const authError = document.getElementById('auth-error');
const userDisplay = document.getElementById('current-user-display');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');

let myUsername = null;

// --- 1. Auto-Login Logic ---
// Runs immediately when page loads
const savedUser = localStorage.getItem('chatUser');
if (savedUser) {
    const creds = JSON.parse(savedUser);
    socket.emit('login', creds); // Try logging in automatically
}

// --- Auth Functions ---
function getCredentials() {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    return { username: u, password: p };
}

function register() {
    const creds = getCredentials();
    if (!creds.username || !creds.password) return alert("Fill in both fields");
    socket.emit('register', creds);
}

function login() {
    const creds = getCredentials();
    if (!creds.username || !creds.password) return alert("Fill in both fields");
    socket.emit('login', creds);
}

function logout() {
    localStorage.removeItem('chatUser'); // Clear saved data
    location.reload(); // Refresh page
}

// --- Socket Listeners (Auth) ---
socket.on('registerResponse', (data) => {
    if (data.success) {
        handleSuccessfulLogin(data.username);
    } else {
        authError.innerText = data.message;
    }
});

socket.on('loginResponse', (data) => {
    if (data.success) {
        handleSuccessfulLogin(data.username);
    } else {
        // If auto-login fails, clear it so user can try again
        localStorage.removeItem('chatUser');
        authError.innerText = data.message;
    }
});

function handleSuccessfulLogin(username) {
    myUsername = username;
    
    // Save to LocalStorage for next time
    const pass = document.getElementById('password').value;
    // Note: If this was auto-login, pass input might be empty, so check savedUser
    if(pass) {
        localStorage.setItem('chatUser', JSON.stringify({ username: username, password: pass }));
    }

    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    userDisplay.innerText = username;
}

// --- Chat Logic ---

function formatTimeCentral(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', // Central Time Zone
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (msgInput.value) {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
    }
});

// Render a single message
function appendMessage(data) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.id = `msg-${data.id}`; // ID for deletion
    
    const timeStr = formatTimeCentral(data.timestamp);

    if (data.user === 'System') {
        div.classList.add('system-msg');
        div.innerHTML = `<span class="timestamp">[${timeStr}]</span> ${data.text}`;
    } else {
        // Show delete button ONLY if I wrote this message
        let deleteBtnHTML = '';
        if (data.user === myUsername) {
            deleteBtnHTML = `<span class="delete-btn" onclick="deleteMsg('${data.id}')" title="Delete">🗑️</span>`;
        }

        div.innerHTML = `
            <span class="timestamp">[${timeStr}]</span> 
            <strong>${data.user}:</strong> 
            <span class="msg-text">${data.text}</span>
            ${deleteBtnHTML}
        `;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Socket Listeners (Chat) ---

// Load history upon connection
socket.on('loadHistory', (history) => {
    messagesDiv.innerHTML = '';
    history.forEach(msg => appendMessage(msg));
});

// New incoming message
socket.on('message', (data) => {
    appendMessage(data);
});

// A message was deleted
socket.on('messageDeleted', (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
});

// Triggered by the trash icon
window.deleteMsg = function(id) {
    if(confirm("Delete this message?")) {
        socket.emit('deleteMessage', id);
    }
}