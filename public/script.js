const socket = io();
const pageId = document.body.id; 

// --- GLOBAL AUTH CHECK ---
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// Logic: Redirect based on auth status
if (!currentUser && pageId !== 'page-login') {
    window.location.href = 'login.html';
} else if (currentUser && pageId === 'page-login') {
    window.location.href = 'index.html';
}

// Connect if user exists
if (currentUser) {
    socket.emit('login', currentUser);
}

// --- LOGOUT ---
window.logout = function() {
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// ==========================================
// PAGE SPECIFIC LOGIC
// ==========================================

// --- LOGIN PAGE ---
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

    const handleAuth = (data) => {
        if (data.success) {
            const pass = document.getElementById('password').value;
            localStorage.setItem('chatUser', JSON.stringify({ username: data.username, password: pass }));
            window.location.href = 'index.html';
        } else {
            authError.innerText = data.message;
        }
    };

    socket.on('registerResponse', handleAuth);
    socket.on('loginResponse', handleAuth);
}

// --- HOME PAGE ---
if (pageId === 'page-home') {
    socket.on('loginResponse', (data) => {
        if(data.success) {
            document.getElementById('display-name').innerText = data.username;
            document.getElementById('display-pfp').src = data.pfp || 'https://i.pravatar.cc/150';
        }
    });

    socket.on('updateUserList', (users) => {
        const list = document.getElementById('online-users-list');
        if(list) {
            list.innerHTML = '';
            users.forEach(u => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas fa-circle"></i> ${u}`;
                list.appendChild(li);
            });
        }
    });
}

// --- CHAT PAGE ---
if (pageId === 'page-chat') {
    const messagesDiv = document.getElementById('messages');
    const msgInput = document.getElementById('msg-input');
    const onlineList = document.getElementById('online-users-list');
    const typingDiv = document.getElementById('typing-indicator');
    let typingTimeout;

    // Load history immediately
    socket.emit('loadHistory');

    // 1. Listen for Online Users (Fixes the breakage)
    socket.on('updateUserList', (users) => {
        onlineList.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            // Highlight myself
            const isMe = u === currentUser.username ? " (You)" : "";
            li.innerHTML = `<i class="fas fa-circle"></i> ${u}${isMe}`;
            onlineList.appendChild(li);
        });
    });

    // 2. Messaging
    socket.on('message', (data) => appendMessage(data));
    socket.on('loadHistory', (history) => {
        messagesDiv.innerHTML = '';
        history.forEach(msg => appendMessage(msg));
    });

    // 3. Typing
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
    socket.on('userStoppedTyping', () => typingDiv.innerText = '');

    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // 4. Delete
    window.deleteMsg = function(id) {
        if(confirm("Delete?")) socket.emit('deleteMessage', id);
    }
    socket.on('messageDeleted', (id) => {
        const el = document.getElementById(`msg-${id}`);
        if(el) el.remove();
    });

    // 5. Settings Logic (THE FIX)
    const modal = document.getElementById('settings-modal');
    window.toggleSettings = () => {
        modal.classList.toggle('hidden');
        if(!modal.classList.contains('hidden')) {
            // Fill inputs with current data
            document.getElementById('set-new-username').value = currentUser.username;
        }
    };

    window.saveSettings = () => {
        const newName = document.getElementById('set-new-username').value;
        const newPass = document.getElementById('set-new-password').value;
        const newPfp = document.getElementById('set-new-pfp').value;

        socket.emit('updateProfile', {
            newUsername: newName,
            newPassword: newPass,
            newPfp: newPfp
        });
    };

    socket.on('updateProfileResponse', (data) => {
        if(data.success) {
            // Update LocalStorage WITHOUT logging out
            const currentStore = JSON.parse(localStorage.getItem('chatUser'));
            
            // If user typed a new password, save it, otherwise keep old one
            const passToSave = document.getElementById('set-new-password').value || currentStore.password;
            
            const newCreds = {
                username: data.username,
                password: passToSave
            };

            localStorage.setItem('chatUser', JSON.stringify(newCreds));
            currentUser = newCreds; // Update global variable

            alert("Profile Updated Successfully!");
            modal.classList.add('hidden');
            
            // Note: The 'updateUserList' socket event will fire automatically
            // because the server broadcasts it. We don't need to reload.
        } else {
            alert("Error: " + data.message);
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
            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            
            // Show trash can ONLY if it belongs to current user
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