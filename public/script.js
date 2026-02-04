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

function formatTimeCentral(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
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

    if (!document.hidden) socket.emit('markAllSeen');
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) socket.emit('markAllSeen');
    });

    socket.emit('loadHistory');

    socket.on('updateUserList', (users) => {
        if(onlineList) {
            onlineList.innerHTML = '';
            users.forEach(u => {
                const li = document.createElement('li');
                const isMe = u === currentUser.username ? " (You)" : "";
                li.innerHTML = `<i class="fas fa-circle"></i> ${u}${isMe}`;
                onlineList.appendChild(li);
            });
        }
    });

    const updateOrAppendMessage = (data) => {
        const existing = document.getElementById(`msg-${data.id}`);
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) seenText = viewers.length > 5 ? `Seen by ${viewers.length} people` : `Seen by: ${viewers.join(', ')}`;

        if (existing) {
            const seenDiv = existing.querySelector('.seen-status');
            if (seenDiv) seenDiv.innerText = seenText;
        } else {
            const div = document.createElement('div');
            div.id = `msg-${data.id}`;
            div.classList.add('message');
            
            if (data.user === 'System') {
                div.innerHTML = `<div class="system-msg"><span>${data.text}</span></div>`;
            } else {
                const pfp = data.pfp || 'https://i.pravatar.cc/150';
                const timeStr = formatTimeCentral(data.timestamp);
                const canDelete = data.user === currentUser.username ? 
                    `<span class="delete-btn" onclick="deleteMsg('${data.id}')"><i class="fas fa-trash"></i></span>` : '';
                
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
            messagesDiv.appendChild(div);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            if (!document.hidden && data.user !== currentUser.username && !data.seenBy.includes(currentUser.username)) {
                socket.emit('markSeen', data.id);
            }
        }
    };

    socket.on('message', updateOrAppendMessage);
    socket.on('messageUpdated', updateOrAppendMessage);
    socket.on('loadHistory', (h) => {
        messagesDiv.innerHTML = '';
        h.forEach(msg => updateOrAppendMessage(msg));
        if(!document.hidden) socket.emit('markAllSeen');
    });

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

    window.deleteMsg = (id) => { if(confirm("Delete?")) socket.emit('deleteMessage', id); }
    socket.on('messageDeleted', (id) => {
        const el = document.getElementById(`msg-${id}`);
        if(el) el.remove();
    });

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

// ==========================================
// --- PAGE: VIDEO CALL (WEBRTC) ---
// ==========================================
if (pageId === 'page-call') {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const userList = document.getElementById('call-users-list');
    const hangupBtn = document.getElementById('hangup-btn');
    const incomingModal = document.getElementById('incoming-modal');
    
    let localStream;
    let peerConnection;
    let pendingOffer;
    let callerName;

    // Google's free STUN servers are usually enough for many connections
    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }, 
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (err) {
            alert("Error accessing camera: " + err);
        }
    }
    startLocalStream();

    socket.on('updateUserList', (users) => {
        userList.innerHTML = '';
        users.forEach(u => {
            if (u === currentUser.username) return;
            const li = document.createElement('li');
            li.innerHTML = `
                <span><i class="fas fa-circle" style="color:#00e676"></i> ${u}</span>
                <button class="call-icon-btn" onclick="startCall('${u}')"><i class="fas fa-video"></i></button>
            `;
            userList.appendChild(li);
        });
    });

    window.startCall = async (userToCall) => {
        callStatus.innerText = `Calling ${userToCall}...`;
        hangupBtn.disabled = false;
        
        createPeerConnection(userToCall);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { userToCall, offer });
    };

    socket.on('incoming-call', (data) => {
        pendingOffer = data.offer;
        callerName = data.from;
        document.getElementById('caller-name').innerText = `Incoming call from ${callerName}`;
        incomingModal.classList.remove('hidden');
    });

    window.acceptCall = async () => {
        incomingModal.classList.add('hidden');
        callStatus.innerText = `Connected with ${callerName}`;
        hangupBtn.disabled = false;
        createPeerConnection(callerName);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer-call', { to: callerName, answer });
    };

    window.rejectIncomingCall = () => {
        incomingModal.classList.add('hidden');
        socket.emit('reject-call', { to: callerName });
    };

    socket.on('call-answered', async (data) => {
        callStatus.innerText = "Connected";
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('call-rejected', () => {
        callStatus.innerText = "Call Rejected";
        setTimeout(() => callStatus.innerText = "Ready", 2000);
        endCallLogic();
    });

    socket.on('ice-candidate', async (data) => {
        if(peerConnection) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch(e) { console.error('Error adding received ice candidate', e); }
        }
    });

    function createPeerConnection(remoteUser) {
        peerConnection = new RTCPeerConnection(peerConfig);
        peerConnection.onicecandidate = (event) => {
            if(event.candidate) {
                socket.emit('ice-candidate', { to: remoteUser, candidate: event.candidate });
            }
        };
        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };
    }

    window.endCall = () => { location.reload(); }
    
    function endCallLogic() {
        if(peerConnection) peerConnection.close();
        peerConnection = null;
        remoteVideo.srcObject = null;
        hangupBtn.disabled = true;
    }
}