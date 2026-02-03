const socket = io();
const pageId = document.body.id; // 'page-login', 'page-home', or 'page-chat'

// --- GLOBAL AUTH CHECK ---
// 1. Get user from storage
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// 2. Logic: Where should the user be?
if (!currentUser && pageId !== 'page-login') {
    // If not logged in, but on Home or Chat -> Go to Login
    window.location.href = 'login.html';
} else if (currentUser && pageId === 'page-login') {
    // If logged in, but on Login page -> Go to Home
    window.location.href = 'index.html';
}

// 3. Connect Socket if user exists
if (currentUser) {
    socket.emit('login', currentUser);
}

// --- LOGOUT FUNCTION ---
window.logout = function() {
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// ==========================================
// PAGE SPECIFIC LOGIC
// ==========================================

// --- LOGIN PAGE LOGIC ---
if (pageId === 'page-login') {
    const authError = document.getElementById('auth-error');

    window.register = function() {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('register', { username: u, password: p });
    }

    window.login = function() {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('login', { username: u, password: p });
    }

    socket.on('registerResponse', (data) => handleAuth(data));
    socket.on('loginResponse', (data) => handleAuth(data));

    function handleAuth(data) {
        if (data.success) {
            // Save to local storage
            const pass = document.getElementById('password').value;
            localStorage.setItem('chatUser', JSON.stringify({ 
                username: data.username, 
                password: pass 
            }));
            window.location.href = 'index.html'; // Redirect to Home
        } else {
            authError.innerText = data.message;
        }
    }
}

// --- HOME PAGE LOGIC ---
if (pageId === 'page-home') {
    socket.on('loginResponse', (data) => {
        if(data.success) {
            document.getElementById('display-name').innerText = data.username;
            document.getElementById('display-pfp').src = data.pfp || 'https://i.pravatar.cc/150';
        }
    });

    socket.on('updateUserList', (users) => {
        const list = document.getElementById('online-users-list');
        list.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-circle" style="color:#00e676; font-size:0.6rem; margin-right:5px"></i> ${u}`;
            list.appendChild(li);
        });
    });
}

// --- CHAT PAGE LOGIC ---
if (pageId === 'page-chat') {
    const messagesDiv = document.getElementById('messages');
    const msgInput = document.getElementById('msg-input');
    const onlineList = document.getElementById('online-users-list');
    const typingDiv = document.getElementById('typing-indicator');
    let typingTimeout;

    // Listeners
    socket.on('updateUserList', (users) => {
        onlineList.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-circle" style="color:#00e676; font-size:0.6rem; margin-right:5px"></i> ${u}`;
            onlineList.appendChild(li);
        });
    });

    socket.on('message', (data) => appendMessage(data));
    socket.on('loadHistory', (history) => {
        messagesDiv.innerHTML = '';
        history.forEach(msg => appendMessage(msg));
    });
    
    // Typing
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
    socket.on('userStoppedTyping', () => typingDiv.innerText = '');

    // Sending
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // Delete
    window.deleteMsg = function(id) {
        if(confirm("Delete?")) socket.emit('deleteMessage', id);
    }
    socket.on('messageDeleted', (id) => {
        const el = document.getElementById(`msg-${id}`);
        if(el) el.remove();
    });

    // Settings
    const modal = document.getElementById('settings-modal');
    window.toggleSettings = () => modal.classList.toggle('hidden');
    window.saveSettings = () => {
        socket.emit('updateProfile', {
            newUsername: document.getElementById('set-new-username').value,
            newPassword: document.getElementById('set-new-password').value,
            newPfp: document.getElementById('set-new-pfp').value
        });
    };
    socket.on('updateProfileResponse', (data) => {
        if(data.success) {
            alert("Updated! Log in again.");
            logout();
        } else {
            alert(data.message);
        }
    });

    function appendMessage(data) {
        const div = document.createElement('div');
        div.id = `msg-${data.id}`;
        div.classList.add('message');
        if (data.user === 'System') {
            div.classList.add('system-msg');
            div.innerText = data.text;
        } else {
            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            const canDelete = data.user === currentUser.username ? 
                `<span class="delete-btn" onclick="deleteMsg('${data.id}')"><i class="fas fa-trash"></i></span>` : '';
            
            div.innerHTML = `
                <img src="${pfp}" class="msg-pfp">
                <div class="msg-content">
                    <div><strong style="color:#8ab4f8">${data.user}</strong></div>
                    <div style="word-break:break-word">${data.text}</div>
                </div>
                ${canDelete}
            `;
        }
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}