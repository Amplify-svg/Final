const socket = io();
socket.on('connect', () => console.log('Socket connected:', socket.id));
socket.on('connect_error', (err) => console.error('Socket connect_error:', err));
const pageId = document.body.id; 

// --- AUTH DATA ---
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// Redirects
if (!currentUser && pageId !== 'page-login') window.location.href = 'login.html';
else if (currentUser && pageId === 'page-login') window.location.href = 'index.html';

// Global Login
if (currentUser) socket.emit('login', currentUser);

window.logout = function() {
    if(currentUser) socket.emit('chatLeave', currentUser.username); 
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// --- TIME FORMATTER ---
function formatTimeCentral(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
    });
}

// ==========================================
// --- PAGE: LOGIN ---
// ==========================================
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

// ==========================================
// --- PAGE: HOME ---
// ==========================================
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

// ==========================================
// --- PAGE: CHAT ROOM ---
// ==========================================
if (pageId === 'page-chat') {
    const messagesDiv = document.getElementById('messages');
    const msgInput = document.getElementById('msg-input');
    const onlineList = document.getElementById('online-users-list');
    const typingDiv = document.getElementById('typing-indicator');
    let typingTimeout;

    socket.emit('chatJoin', currentUser.username);

    window.addEventListener('beforeunload', () => {
        socket.emit('chatLeave', currentUser.username);
    });

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
                const isMe = u === currentUser.username ? " <span style='opacity:0.5'>(You)</span>" : "";
                li.innerHTML = `<i class="fas fa-circle"></i> <span>${u}${isMe}</span>`;
                onlineList.appendChild(li);
            });
        }
    });

    const updateOrAppendMessage = (data) => {
        const existingWrapper = document.getElementById(`wrapper-${data.id}`);
        
        // 1. System Messages
        if (data.user === 'System' || data.type === 'system') {
            if(existingWrapper) return; // Don't duplicate system messages
            const sysDiv = document.createElement('div');
            sysDiv.className = 'system-message-wrapper';
            sysDiv.innerHTML = `<span>${data.text} &bull; ${formatTimeCentral(data.timestamp)}</span>`;
            messagesDiv.appendChild(sysDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return;
        }

        // 2. Data Prep
        // Fix: Case insensitive check to prevent alignment bugs
        const isMe = data.user.toLowerCase() === currentUser.username.toLowerCase();
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) seenText = viewers.length > 5 ? `Seen by ${viewers.length}` : `Seen by ${viewers.join(', ')}`;

        // 3. Render
        if (existingWrapper) {
            const seenEl = existingWrapper.querySelector('.seen-status');
            if (seenEl) seenEl.innerText = seenText;
        } else {
            const wrapper = document.createElement('div');
            wrapper.id = `wrapper-${data.id}`;
            wrapper.classList.add('message-wrapper');
            wrapper.classList.add(isMe ? 'me' : 'other'); // This triggers CSS alignment

            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            const timeStr = formatTimeCentral(data.timestamp);
            
            const deleteHtml = isMe ? 
                `<i class="fas fa-trash delete-icon" onclick="deleteMsg('${data.id}')" title="Delete"></i>` : '';

            // Bubble content
            const nameColor = isMe ? '#000' : 'var(--primary)';

            wrapper.innerHTML = `
                <div class="msg-row">
                    ${!isMe ? `<img src="${pfp}" class="msg-pfp">` : ''} 
                    
                    <div class="msg-bubble">
                        <div class="msg-header">
                            <span class="username" style="color: ${nameColor}">${data.user}</span>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <span class="timestamp">${timeStr}</span>
                                ${deleteHtml}
                            </div>
                        </div>
                        <div class="msg-text">${data.text}</div>
                    </div>
                </div>
                <div class="seen-status">${seenText}</div>
            `;

            messagesDiv.appendChild(wrapper);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            if (!document.hidden && !isMe && !data.seenBy.includes(currentUser.username)) {
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

    // Typing
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
    socket.on('userStoppedTyping', () => typingDiv.innerText = '');

    // Send
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // Actions
    window.deleteMsg = (id) => { if(confirm("Delete this message?")) socket.emit('deleteMessage', id); }
    socket.on('messageDeleted', (id) => { socket.emit('loadHistory'); });

    // Settings Modal
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
// --- PAGE: VIDEO CALL ---
// ==========================================
if (pageId === 'page-call') {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const userList = document.getElementById('call-users-list');
    const hangupBtn = document.getElementById('hangup-btn');
    const incomingModal = document.getElementById('incoming-modal');
    
    let localStream, remoteStream, peerConnection, pendingOffer, callerName;
    let iceQueue = [], earlyCandidates = [];

    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    async function startLocalStream() {
        try {
            console.log('Requesting local media...');
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localVideo.muted = true; 
            console.log('Local media started');
            callStatus.innerText = "Ready";
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Camera access denied.");
            callStatus.innerText = "Camera Blocked";
        }
    }
    startLocalStream();

    function initRemoteStream() {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
    }

    socket.on('updateUserList', (users) => {
        console.log('Call page - updateUserList:', users);
        userList.innerHTML = '';
        users.forEach(u => {
            if (u === currentUser.username) return;
            const li = document.createElement('li');
            li.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;';
            li.innerHTML = `
                <span><i class="fas fa-circle" style="color:#00e676; margin-right:5px;"></i> ${u}</span>
                <button class="call-icon-btn" onclick="startCall('${u}')" style="background:#00e676; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-video"></i></button>
            `;
            userList.appendChild(li);
        });
    });

    window.startCall = async (userToCall) => {
        console.log('startCall() =>', userToCall);
        if (!localStream) return alert("Camera not ready.");
        initRemoteStream();
        callStatus.innerText = `Calling ${userToCall}...`;
        hangupBtn.disabled = false;
        
        createPeerConnection(userToCall);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Emitting call-user to', userToCall);
            socket.emit('call-user', { userToCall, offer });
        } catch (err) { console.error(err); }
    };

    socket.on('incoming-call', (data) => {
        console.log('incoming-call received:', data);
        pendingOffer = data.offer;
        callerName = data.from;
        document.getElementById('caller-name').innerText = `Incoming from ${callerName}`;
        incomingModal.classList.remove('hidden');
    });

    window.acceptCall = async () => {
        console.log('acceptCall() from:', callerName);
        if (!localStream) return alert("Camera not ready.");
        initRemoteStream();
        incomingModal.classList.add('hidden');
        callStatus.innerText = "Connecting...";
        hangupBtn.disabled = false;

        createPeerConnection(callerName);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
            while (iceQueue.length > 0) await peerConnection.addIceCandidate(iceQueue.shift());
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log('Sending answer to', callerName);
            socket.emit('answer-call', { to: callerName, answer });
        } catch (err) { console.error(err); }
    };

    window.rejectIncomingCall = () => {
        incomingModal.classList.add('hidden');
        socket.emit('reject-call', { to: callerName });
    };

    socket.on('call-answered', async (data) => {
        console.log('call-answered received:', data);
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            while (iceQueue.length > 0) await peerConnection.addIceCandidate(iceQueue.shift());
            callStatus.innerText = "Connected";
        } catch (err) { console.error(err); }
    });

    socket.on('call-rejected', () => {
        callStatus.innerText = "Call Rejected";
        setTimeout(() => callStatus.innerText = "Ready", 2000);
        endCallLogic();
    });

    socket.on('ice-candidate', async (data) => {
        console.log('remote ice-candidate:', data);
        if (!peerConnection) {
            earlyCandidates.push(data.candidate);
            return;
        }
        try {
            if (peerConnection.remoteDescription) await peerConnection.addIceCandidate(data.candidate);
            else iceQueue.push(data.candidate);
        } catch(e) { console.error('ICE Error:', e); }
    });

    function createPeerConnection(remoteUser) {
        console.log('createPeerConnection() for', remoteUser);
        iceQueue = [];
        peerConnection = new RTCPeerConnection(peerConfig);
        if (earlyCandidates.length > 0) {
            earlyCandidates.forEach(c => iceQueue.push(c));
            earlyCandidates = [];
        }

        peerConnection.onicecandidate = (event) => {
            console.log('Local ICE candidate:', event.candidate);
            if(event.candidate) socket.emit('ice-candidate', { to: remoteUser, candidate: event.candidate });
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'connected') callStatus.innerText = "Connected";
            else if (peerConnection.iceConnectionState === 'disconnected') {
                callStatus.innerText = "Disconnected";
                endCallLogic();
            }
        };

        peerConnection.ontrack = (event) => {
            console.log('Remote track received:', event.track);
            if (remoteStream) {
                remoteStream.addTrack(event.track);
                if (remoteVideo.paused) remoteVideo.play().catch(e => console.error(e));
            }
        };
    }

    window.endCall = () => { location.reload(); }
    
    function endCallLogic() {
        if(peerConnection) peerConnection.close();
        peerConnection = null;
        if(remoteStream) {
            remoteStream.getTracks().forEach(t => t.stop());
            remoteStream = null;
        }
        remoteVideo.srcObject = null;
        hangupBtn.disabled = true;
        earlyCandidates = [];
    }
}