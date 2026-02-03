const socket = io();

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const settingsModal = document.getElementById('settings-modal');
const authError = document.getElementById('auth-error');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');
const onlineList = document.getElementById('online-users-list');
const typingDiv = document.getElementById('typing-indicator');

// Settings Inputs
const newUsernameInput = document.getElementById('set-new-username');
const newPasswordInput = document.getElementById('set-new-password');
const newPfpInput = document.getElementById('set-new-pfp');

let myUsername = null;
let myPfp = null;
let typingTimeout = undefined;

// --- Auto-Login ---
const savedUser = localStorage.getItem('chatUser');
if (savedUser) {
    const creds = JSON.parse(savedUser);
    socket.emit('login', creds);
}

// --- Auth Functions ---
function getCredentials() {
    return {
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value.trim()
    };
}

function register() {
    const creds = getCredentials();
    if (creds.username && creds.password) socket.emit('register', creds);
}

function login() {
    const creds = getCredentials();
    if (creds.username && creds.password) socket.emit('login', creds);
}

function logout() {
    localStorage.removeItem('chatUser');
    location.reload();
}

// --- Settings Logic ---
function toggleSettings() {
    settingsModal.classList.toggle('hidden');
    // Pre-fill current values
    if (!settingsModal.classList.contains('hidden')) {
        newUsernameInput.value = myUsername;
        newPfpInput.value = myPfp;
    }
}

function saveSettings() {
    const data = {
        newUsername: newUsernameInput.value.trim(),
        newPassword: newPasswordInput.value.trim(), // Optional
        newPfp: newPfpInput.value.trim() // Optional
    };
    
    if (data.newUsername) {
        socket.emit('updateProfile', data);
    }
}

socket.on('updateProfileResponse', (data) => {
    if (data.success) {
        myUsername = data.username;
        myPfp = data.pfp;
        
        // Update LocalStorage (keep password if not changed)
        const oldStore = JSON.parse(localStorage.getItem('chatUser'));
        const newPass = newPasswordInput.value.trim() || oldStore.password;
        
        localStorage.setItem('chatUser', JSON.stringify({
            username: myUsername,
            password: newPass
        }));

        alert('Profile Updated!');
        toggleSettings();
    } else {
        alert('Error: ' + data.message);
    }
});


// --- Socket Listeners (Auth) ---
socket.on('registerResponse', (data) => handleAuthResponse(data));
socket.on('loginResponse', (data) => handleAuthResponse(data));

function handleAuthResponse(data) {
    if (data.success) {
        myUsername = data.username;
        myPfp = data.pfp;
        
        const pass = document.getElementById('password').value;
        if(pass) {
            localStorage.setItem('chatUser', JSON.stringify({ username: myUsername, password: pass }));
        }

        loginScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        
        // Trigger a resize for particles to fill the new layout
        window.dispatchEvent(new Event('resize')); 
    } else {
        localStorage.removeItem('chatUser');
        authError.innerText = data.message;
    }
}

// --- Online Users ---
socket.on('updateUserList', (users) => {
    onlineList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.innerText = user === myUsername ? `${user} (You)` : user;
        onlineList.appendChild(li);
    });
});

// --- Typing Indicator ---
msgInput.addEventListener('input', () => {
    socket.emit('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stopTyping');
    }, 1000); // Stop after 1 second of no typing
});

socket.on('userTyping', (user) => {
    typingDiv.innerText = `${user} is typing...`;
});

socket.on('userStoppedTyping', (user) => {
    typingDiv.innerText = '';
});

// --- Chat Logic ---
function formatTimeCentral(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric', minute: '2-digit', hour12: true
    });
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (msgInput.value) {
        socket.emit('chatMessage', msgInput.value);
        msgInput.value = '';
        socket.emit('stopTyping');
    }
});

function appendMessage(data) {
    const div = document.createElement('div');
    div.id = `msg-${data.id}`;
    
    if (data.user === 'System') {
        div.classList.add('message', 'system-msg');
        div.innerText = data.text;
    } else {
        div.classList.add('message');
        
        // Determine PFP (use default if null)
        const pfpUrl = data.pfp || 'https://i.pravatar.cc/150';
        
        // Delete button logic
        let deleteBtnHTML = '';
        if (data.user === myUsername) {
            deleteBtnHTML = `<span class="delete-btn" onclick="deleteMsg('${data.id}')"><i class="fas fa-trash"></i></span>`;
        }

        div.innerHTML = `
            <img src="${pfpUrl}" class="msg-pfp" alt="pfp">
            <div class="msg-content">
                <div>
                    <strong style="color:#8ab4f8">${data.user}</strong>
                    <span class="timestamp">${formatTimeCentral(data.timestamp)}</span>
                </div>
                <div class="msg-text">${data.text}</div>
            </div>
            ${deleteBtnHTML}
        `;
    }
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

socket.on('loadHistory', (history) => {
    messagesDiv.innerHTML = '';
    history.forEach(msg => appendMessage(msg));
});

socket.on('message', (data) => appendMessage(data));

socket.on('messageDeleted', (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.remove();
});

window.deleteMsg = function(id) {
    if(confirm("Delete this message?")) {
        socket.emit('deleteMessage', id);
    }
}