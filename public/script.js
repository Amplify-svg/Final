const socket = io();

// UI Elements
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const chatBox = document.getElementById('chatBox');
const messageForm = document.getElementById('messageInputBox');
const messageInput = document.getElementById('messageInput');

// 1. Setup Identity
const username = prompt("Enter your Nexus Handle:") || "Guest";
document.getElementById('headerUserName').innerText = username;
document.getElementById('userAvatar').innerText = username.charAt(0).toUpperCase();

// 2. UI Functions
window.toggleSidebar = () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
};

window.toggleDarkMode = () => {
    document.body.classList.toggle('dark-mode');
};

// 3. Chat Logic
function appendMessage(data) {
    const isOwn = data.user === username;
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg-bubble ${isOwn ? 'msg-own' : 'msg-other'}`;
    
    msgDiv.innerHTML = `
        <div style="font-size: 10px; margin-bottom: 4px; opacity: 0.7;">${data.user} • ${data.time}</div>
        <div>${data.text}</div>
    `;
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (messageInput.value.trim()) {
        socket.emit('chat message', {
            user: username,
            text: messageInput.value
        });
        messageInput.value = '';
    }
});

// Listen for history and new messages
socket.on('load history', (history) => {
    history.forEach(msg => appendMessage(msg));
});

socket.on('chat message', (data) => {
    appendMessage(data);
});