const socket = io();
const pageId = document.body.id; 

const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// Auth Redirects
if (!currentUser && pageId !== 'page-login') window.location.href = 'login.html';
else if (currentUser && pageId === 'page-login') window.location.href = 'index.html';

if (currentUser) socket.emit('login', currentUser);

window.logout = function() {
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// --- CENTRAL TIME HELPER ---
function formatTimeCentral(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', // Central Standard/Daylight Time
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// --- LOGIN PAGE ---
if (pageId === 'page-login') {
    const authError = document.getElementById('auth-error');
    const handleAuth = (data) => {
        if (data.success) {
            const pass = document.getElementById('password').value;
            localStorage.setItem('chatUser', JSON.stringify({ username: data.username, password: pass }));
            window.location.href = 'index.html';
        } else {
            authError.innerText = data.message;
        }
    };
    window.register = () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('register', { username: u, password: p });
    };
    window.login = () => {
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();
        if(u && p) socket.emit('login', { username: u, password: p });
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

    // 1. "Tabbed Out" / Visibility Logic
    // If page is visible, tell server we saw everything
    if (!document.hidden) socket.emit('markAllSeen');

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            socket.emit('markAllSeen');
        }
    });

    socket.emit('loadHistory');

    // 2. Render Logic
    const renderMessage = (data) => {
        // If message already exists (update "seen by"), remove old one to re-render
        const existing = document.getElementById(`msg-${data.id}`);
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = `msg-${data.id}`;
        div.classList.add('message');

        const timeStr = formatTimeCentral(data.timestamp);

        if (data.user === 'System') {
            div.innerHTML = `<div class="system-msg"><span>${data.text}</span></div>`;
        } else {
            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            const canDelete = data.user === currentUser.username ? 
                `<span class="delete-btn" onclick="deleteMsg('${data.id}')"><i class="fas fa-trash"></i></span>` : '';

            // Format "Seen by" list
            // Filter out the sender and yourself (optional preference, usually you know you saw it)
            // But usually "Seen by" implies "Others who saw it".
            const viewers = data.seenBy.filter(u => u !== data.user);
            let seenText = '';
            if (viewers.length > 0) {
                const names = viewers.join(', ');
                seenText = `Seen by: ${names}`;
                if (viewers.length > 3) seenText = `Seen by: ${viewers.length} people`;
            }

            div.innerHTML = `
                <div class="msg-top">
                    <img src="${pfp}" class="msg-pfp">
                    <div class="msg-bubble">
                        <div class="msg-header">
                            <span class="username">${data.user}</span>
                            <span class="timestamp">${timeStr}</span>
                        </div>
                        <div style="word-break:break-word">${data.text}</div>
                    </div>
                    ${canDelete}
                </div>
                <div class="seen-status">${seenText}</div>
            `;
        }
        
        // Insert in order? Simple append works for new messages.
        // For updates, we need to be careful not to mess up order.
        // Simplest way for this level: Just append if new, if updating find position? 
        // We removed 'existing' above. If we just append, it jumps to bottom.
        // Better approach for updates: Replace content if ID exists.
        
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // Auto-mark as seen if we are looking at it
        if (!document.hidden && data.user !== currentUser.username && !data.seenBy.includes(currentUser.username)) {
            socket.emit('markSeen', data.id);
        }
    };

    // Improved Renderer that handles updates without jumping
    const updateOrAppendMessage = (data) => {
        const existing = document.getElementById(`msg-${data.id}`);
        
        // Calculate "Seen by" text
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) {
             // If lots of people, truncate
            seenText = viewers.length > 5 ? `Seen by ${viewers.length} people` : `Seen by: ${viewers.join(', ')}`;
        }

        if (existing) {
            // Just update the "Seen" div
            const seenDiv = existing.querySelector('.seen-status');
            if (seenDiv) seenDiv.innerText = seenText;
        } else {
            // New Message
            renderMessage(data); 
        }
    };

    socket.on('message', (data) => updateOrAppendMessage(data));
    socket.on('messageUpdated', (data) => updateOrAppendMessage(data));
    
    socket.on('loadHistory', (history) => {
        messagesDiv.innerHTML = '';
        history.forEach(msg => renderMessage(msg));
        if(!document.hidden) socket.emit('markAllSeen');
    });

    socket.on('updateUserList', (users) => {
        onlineList.innerHTML = '';
        users.forEach(u => {
            const li = document.createElement('li');
            const isMe = u === currentUser.username ? " (You)" : "";
            li.innerHTML = `<i class="fas fa-circle"></i> ${u}${isMe}`;
            onlineList.appendChild(li);
        });
    });

    // Inputs
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // Delete
    window.deleteMsg = (id) => { if(confirm("Delete?")) socket.emit('deleteMessage', id); }
    socket.on('messageDeleted', (id) => {
        const el = document.getElementById(`msg-${id}`);
        if(el) el.remove();
    });

    // Settings
    const modal = document.getElementById('settings-modal');
    window.toggleSettings = () => {
        modal.classList.toggle('hidden');
        if(!modal.classList.contains('hidden')) {
            document.getElementById('set-new-username').value = currentUser.username;
        }
    };
    window.saveSettings = () => {
        const n = document.getElementById('set-new-username').value;
        const p = document.getElementById('set-new-password').value;
        const img = document.getElementById('set-new-pfp').value;
        socket.emit('updateProfile', { newUsername: n, newPassword: p, newPfp: img });
    };
    socket.on('updateProfileResponse', (data) => {
        if(data.success) {
            const currentStore = JSON.parse(localStorage.getItem('chatUser'));
            const passToSave = document.getElementById('set-new-password').value || currentStore.password;
            const newCreds = { username: data.username, password: passToSave };
            localStorage.setItem('chatUser', JSON.stringify(newCreds));
            currentUser = newCreds;
            alert("Updated!");
            modal.classList.add('hidden');
        } else {
            alert(data.message);
        }
    });
}