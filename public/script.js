const socket = io();
const pageId = document.body.id; 

// --- AUTH DATA ---
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// Redirects
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
// --- PAGE: VIDEO CALL (NETWORK FIX APPLIED) ---
// ==========================================
if (pageId === 'page-call') {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.getElementById('call-status');
    const userList = document.getElementById('call-users-list');
    const hangupBtn = document.getElementById('hangup-btn');
    const incomingModal = document.getElementById('incoming-modal');
    
    let localStream;
    let remoteStream;
    let peerConnection;
    let pendingOffer;
    let callerName;
    
    // QUEUES TO SAVE PACKETS
    let iceQueue = [];         // Candidates waiting for Remote Description
    let earlyCandidates = [];  // Candidates waiting for User to click "Accept"

    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    };

    // 1. Start Local Camera
    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localVideo.muted = true; 
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Camera access denied. Ensure you are using HTTPS.");
            callStatus.innerText = "Camera Blocked";
        }
    }
    startLocalStream();

    function initRemoteStream() {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
    }

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

    // 3. START CALL
    window.startCall = async (userToCall) => {
        if (!localStream) return alert("Camera not ready.");
        
        initRemoteStream();
        callStatus.innerText = `Calling ${userToCall}...`;
        hangupBtn.disabled = false;
        
        createPeerConnection(userToCall);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('call-user', { userToCall, offer });
        } catch (err) { console.error(err); }
    };

    socket.on('incoming-call', (data) => {
        pendingOffer = data.offer;
        callerName = data.from;
        document.getElementById('caller-name').innerText = `Incoming call from ${callerName}`;
        incomingModal.classList.remove('hidden');
    });

    // 4. ACCEPT CALL
    window.acceptCall = async () => {
        if (!localStream) return alert("Camera not ready.");
        
        initRemoteStream();
        incomingModal.classList.add('hidden');
        callStatus.innerText = "Connecting...";
        hangupBtn.disabled = false;

        createPeerConnection(callerName);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
            
            // FLUSH THE QUEUE: Process all candidates that arrived before we clicked Accept
            while (iceQueue.length > 0) {
                await peerConnection.addIceCandidate(iceQueue.shift());
            }
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer-call', { to: callerName, answer });
        } catch (err) { console.error(err); }
    };

    window.rejectIncomingCall = () => {
        incomingModal.classList.add('hidden');
        socket.emit('reject-call', { to: callerName });
    };

    socket.on('call-answered', async (data) => {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            while (iceQueue.length > 0) {
                await peerConnection.addIceCandidate(iceQueue.shift());
            }
        } catch (err) { console.error(err); }
    });

    socket.on('call-rejected', () => {
        callStatus.innerText = "Call Rejected";
        setTimeout(() => callStatus.innerText = "Ready", 2000);
        endCallLogic();
    });

    // --- CRITICAL FIX: HANDLE EARLY CANDIDATES ---
    socket.on('ice-candidate', async (data) => {
        // If connection doesn't exist yet (user hasn't clicked accept), SAVE IT.
        if (!peerConnection) {
            console.log("Saving early candidate...");
            earlyCandidates.push(data.candidate);
            return;
        }
        
        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(data.candidate);
            } else {
                iceQueue.push(data.candidate);
            }
        } catch(e) { console.error('ICE Error:', e); }
    });

    function createPeerConnection(remoteUser) {
        iceQueue = [];
        peerConnection = new RTCPeerConnection(peerConfig);

        // MOVE EARLY CANDIDATES TO THE MAIN QUEUE
        if (earlyCandidates.length > 0) {
            console.log(`Processing ${earlyCandidates.length} saved candidates`);
            earlyCandidates.forEach(c => iceQueue.push(c));
            earlyCandidates = [];
        }

        peerConnection.onicecandidate = (event) => {
            if(event.candidate) {
                socket.emit('ice-candidate', { to: remoteUser, candidate: event.candidate });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'connected') {
                callStatus.innerText = "Connected";
            } else if (peerConnection.iceConnectionState === 'disconnected') {
                callStatus.innerText = "Disconnected";
                endCallLogic();
            }
        };

        peerConnection.ontrack = (event) => {
            console.log("Track received:", event.track.kind);
            if (remoteStream) {
                remoteStream.addTrack(event.track);
                if (remoteVideo.paused) {
                     remoteVideo.play().catch(e => console.error("Auto-play failed", e));
                }
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