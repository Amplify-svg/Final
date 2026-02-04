const socket = io();
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
    // Notify server we are leaving before clearing data
    if(currentUser) socket.emit('chatLeave', currentUser.username); 
    localStorage.removeItem('chatUser');
    window.location.href = 'login.html';
}

// --- TIME FORMATTER (CENTRAL TIME) ---
function formatTimeCentral(isoString) {
    if (!isoString) return new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true
    });
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
    // Simple online list for Dashboard
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
// --- PAGE: CHAT ROOM (VISUAL OVERHAUL) ---
// ==========================================
if (pageId === 'page-chat') {
    const messagesDiv = document.getElementById('messages');
    const msgInput = document.getElementById('msg-input');
    const onlineList = document.getElementById('online-users-list');
    const typingDiv = document.getElementById('typing-indicator');
    let typingTimeout;

    // 1. Notify Server of Join/Leave for System Messages
    // We emit a special event when this specific page loads
    socket.emit('chatJoin', currentUser.username);

    // Detect when user leaves the page (closes tab or goes back)
    window.addEventListener('beforeunload', () => {
        socket.emit('chatLeave', currentUser.username);
    });

    if (!document.hidden) socket.emit('markAllSeen');
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) socket.emit('markAllSeen');
    });

    socket.emit('loadHistory');

    // Update Sidebar User List
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

    // --- MAIN MESSAGE RENDERER ---
    const updateOrAppendMessage = (data) => {
        const existing = document.getElementById(`msg-${data.id}`);
        
        // Handle "System" messages (Joined/Left) differently
        if (data.user === 'System' || data.type === 'system') {
            const sysDiv = document.createElement('div');
            sysDiv.className = 'system-message-wrapper';
            sysDiv.style.textAlign = 'center';
            sysDiv.style.margin = '10px 0';
            sysDiv.style.opacity = '0.7';
            sysDiv.innerHTML = `<span style="background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; color: #aaa;">${data.text} <span style="font-size:0.7em; margin-left:5px;">${formatTimeCentral(data.timestamp)}</span></span>`;
            messagesDiv.appendChild(sysDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return;
        }

        // Handle Normal Chat Messages
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) seenText = viewers.length > 5 ? `Seen by ${viewers.length}` : `Seen by: ${viewers.join(', ')}`;

        if (existing) {
            const seenDiv = existing.querySelector('.seen-status');
            if (seenDiv) seenDiv.innerText = seenText;
        } else {
            const div = document.createElement('div');
            div.id = `msg-${data.id}`;
            
            const isMe = data.user === currentUser.username;
            div.classList.add('message');
            // Add classes for CSS styling
            div.classList.add(isMe ? 'me' : 'other');
            
            // Standard User Message Structure
            const pfp = data.pfp || 'https://i.pravatar.cc/150';
            const timeStr = formatTimeCentral(data.timestamp);
            
            const deleteBtn = isMe ? 
                `<i class="fas fa-trash delete-icon" onclick="deleteMsg('${data.id}')" title="Delete Message" style="margin-left:10px; cursor:pointer; font-size: 0.8rem; opacity: 0.5;"></i>` : '';
            
            // HTML Structure aligned with "Nexus" CSS
            // 1. Avatar (only if not me)
            // 2. Bubble containing Header (Name+Time) and Body (Text)
            
            let html = '';
            
            if (!isMe) {
                html += `<img src="${pfp}" class="msg-pfp" style="width:35px; height:35px; border-radius:50%; margin-right:10px; align-self:flex-end;">`;
            }

            html += `
                <div class="msg-bubble" style="max-width: 70%; display:flex; flex-direction:column;">
                    <div class="msg-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; font-size:0.85rem;">
                        <span class="username" style="font-weight:bold; color: ${isMe ? '#000' : '#00e676'}">${data.user}</span>
                        <span class="timestamp" style="font-size:0.7rem; opacity:0.7; margin-left:8px;">${timeStr}</span>
                    </div>
                    <div class="msg-text" style="line-height:1.4;">${data.text}</div>
                    ${isMe ? `<div style="text-align:right; margin-top:5px;">${deleteBtn}</div>` : ''}
                </div>
            `;

            div.innerHTML = html;
            div.style.display = 'flex';
            div.style.justifyContent = isMe ? 'flex-end' : 'flex-start';
            div.style.marginBottom = '15px';

            // Append "Seen" status below the message row
            const statusRow = document.createElement('div');
            statusRow.className = 'seen-status';
            statusRow.style.fontSize = '0.7rem';
            statusRow.style.color = '#666';
            statusRow.style.textAlign = isMe ? 'right' : 'left';
            statusRow.style.marginLeft = isMe ? '0' : '50px'; // Indent for avatar
            statusRow.style.marginRight = isMe ? '10px' : '0';
            statusRow.innerText = seenText;
            
            // Wrapper to hold message + status
            const wrapper = document.createElement('div');
            wrapper.appendChild(div);
            wrapper.appendChild(statusRow);

            messagesDiv.appendChild(wrapper);
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

    // TYPING INDICATOR
    msgInput.addEventListener('input', () => {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
    });
    socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
    socket.on('userStoppedTyping', () => typingDiv.innerText = '');

    // SEND MESSAGE
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if(msgInput.value) {
            socket.emit('chatMessage', msgInput.value);
            msgInput.value = '';
            socket.emit('stopTyping');
        }
    });

    // SETTINGS / DELETE
    window.deleteMsg = (id) => { if(confirm("Delete this message?")) socket.emit('deleteMessage', id); }
    socket.on('messageDeleted', (id) => {
        // We have to reload history or remove element. 
        // Simple way: remove the wrapper (which we didn't ID). 
        // Better: Reload history
        socket.emit('loadHistory');
    });

    // ... (Settings Modal Code stays the same) ...
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
// --- PAGE: VIDEO CALL (Unchanged) ---
// ==========================================
// ... (Keep your existing video call code here exactly as it was) ...
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
    
    let iceQueue = [];
    let earlyCandidates = [];

    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    };

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localVideo.muted = true; 
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
        userList.innerHTML = '';
        users.forEach(u => {
            if (u === currentUser.username) return;
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.marginBottom = '10px';
            li.innerHTML = `
                <span><i class="fas fa-circle" style="color:#00e676; margin-right:5px;"></i> ${u}</span>
                <button class="call-icon-btn" onclick="startCall('${u}')" style="background:#00e676; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-video"></i></button>
            `;
            userList.appendChild(li);
        });
    });

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

    socket.on('ice-candidate', async (data) => {
        if (!peerConnection) {
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
        if (earlyCandidates.length > 0) {
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