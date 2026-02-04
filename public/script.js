const socket = io();
const pageId = document.body.id; 

// --- AUTH DATA ---
const savedUser = localStorage.getItem('chatUser');
let currentUser = savedUser ? JSON.parse(savedUser) : null;

// --- GLOBAL REDIRECTS ---
if (!currentUser && pageId !== 'page-login') {
    window.location.href = 'login.html';
} else if (currentUser && pageId === 'page-login') {
    window.location.href = 'index.html';
}

// Auto-login on socket connect if user exists
if (currentUser) {
    socket.emit('login', currentUser);
}

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
            // Save full creds for auto-relogin
            localStorage.setItem('chatUser', JSON.stringify({ 
                username: data.username, 
                password: pass,
                pfp: data.pfp || 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + data.username
            }));
            window.location.href = 'index.html';
        } else {
            if(authError) authError.innerText = data.message;
            else alert(data.message);
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
// --- PAGE: HOME (Updated for Big UI) ---
// ==========================================
if (pageId === 'page-home') {
    // 1. Immediate Populate (Don't wait for socket)
    if (currentUser) {
        const nameEl = document.getElementById('display-name');
        const pfpEl = document.getElementById('display-pfp');
        
        if(nameEl) nameEl.innerText = currentUser.username;
        // Use saved PFP or generate one
        if(pfpEl) pfpEl.src = currentUser.pfp || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.username}`;
    }

    // 2. Update if server sends fresh data
    socket.on('loginResponse', (data) => {
        if(data.success) {
            document.getElementById('display-name').innerText = data.username;
            const newPfp = data.pfp || `https://api.dicebear.com/7.x/adventurer/svg?seed=${data.username}`;
            document.getElementById('display-pfp').src = newPfp;
            
            // Update local storage to match
            currentUser.pfp = newPfp;
            localStorage.setItem('chatUser', JSON.stringify(currentUser));
        }
    });

    // 3. Online List
    socket.on('updateUserList', (users) => {
        const list = document.getElementById('online-users-list');
        if(list) {
            list.innerHTML = '';
            users.forEach(u => {
                const li = document.createElement('li');
                // Check if it's me
                const isMe = (u === currentUser.username) ? ' (You)' : '';
                li.innerHTML = `<i class="fas fa-circle" style="color:#00e676; font-size: 0.6rem;"></i> ${u}${isMe}`;
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

    // Visibility Logic
    if (!document.hidden) socket.emit('markAllSeen');
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) socket.emit('markAllSeen');
    });

    socket.emit('loadHistory');

    // Chat Sidebar User List
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
        // Filter out my own name from "Seen By"
        const viewers = data.seenBy ? data.seenBy.filter(u => u !== data.user) : [];
        let seenText = '';
        if (viewers.length > 0) {
            seenText = viewers.length > 3 ? `Seen by ${viewers.length}` : `Seen: ${viewers.join(', ')}`;
        }

        if (existing) {
            const seenDiv = existing.querySelector('.seen-status');
            if (seenDiv) seenDiv.innerText = seenText;
        } else {
            const div = document.createElement('div');
            div.id = `msg-${data.id}`;
            
            const isMe = data.user === currentUser.username;
            div.classList.add('message');
            div.classList.add(isMe ? 'me' : 'other');
            
            if (data.user === 'System') {
                div.innerHTML = `<div style="text-align:center; color:#666; font-size:0.8rem; margin: 10px 0;">${data.text}</div>`;
            } else {
                const pfp = data.pfp || `https://api.dicebear.com/7.x/adventurer/svg?seed=${data.user}`;
                const timeStr = formatTimeCentral(data.timestamp);
                
                // Trash icon only for me
                const deleteHtml = isMe ? 
                    `<i class="fas fa-trash" onclick="deleteMsg('${data.id}')" style="margin-left:10px; cursor:pointer; opacity:0.5; font-size:0.8rem;"></i>` : '';
                
                div.innerHTML = `
                    <div class="msg-top">
                        <img src="${pfp}" class="msg-pfp">
                        <div class="msg-bubble">
                            <div class="msg-header">
                                <span class="username">${isMe ? '' : data.user}</span>
                                <span class="timestamp">${timeStr}</span>
                                ${deleteHtml}
                            </div>
                            <div style="word-break:break-word">${data.text}</div>
                        </div>
                    </div>
                    <div class="seen-status">${seenText}</div>
                `;
            }
            messagesDiv.appendChild(div);
            // Auto scroll to bottom
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            
            // Mark as seen if it's not me
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

    // Typing Logic
    if(msgInput) {
        msgInput.addEventListener('input', () => {
            socket.emit('typing');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => socket.emit('stopTyping'), 1000);
        });
    }

    if(typingDiv) {
        socket.on('userTyping', (u) => typingDiv.innerText = `${u} is typing...`);
        socket.on('userStoppedTyping', () => typingDiv.innerText = '');
    }

    const chatForm = document.getElementById('chat-form');
    if(chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if(msgInput.value.trim()) {
                socket.emit('chatMessage', msgInput.value);
                msgInput.value = '';
                socket.emit('stopTyping');
            }
        });
    }

    window.deleteMsg = (id) => { if(confirm("Delete message?")) socket.emit('deleteMessage', id); }
    socket.on('messageDeleted', (id) => {
        const el = document.getElementById(`msg-${id}`);
        if(el) el.remove();
    });
}

// ==========================================
// --- PAGE: VIDEO CALL ---
// ==========================================
if (pageId === 'page-call') {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callStatus = document.querySelector('.call-status'); 
    const hangupBtn = document.getElementById('hangup-btn');
    // We don't have a user list in the Call UI HTML provided, 
    // but we can listen for incoming calls globally or trigger them manually.
    
    let localStream;
    let remoteStream;
    let peerConnection;
    
    // WebRTC Config
    const peerConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if(localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; // Mute self locally to avoid feedback
            }
            if(callStatus) callStatus.innerText = "Ready to connect";
            
            // Tell server we are ready for calls
            socket.emit('ready-for-call'); 
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Camera access denied or missing.");
        }
    }
    
    // Start camera immediately on load
    startLocalStream();

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(peerConfig);

        // Add local tracks
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Handle ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        // Handle Stream
        peerConnection.ontrack = (event) => {
            if(remoteVideo) remoteVideo.srcObject = event.streams[0];
            if(callStatus) {
                callStatus.innerText = "Connected";
                callStatus.style.color = "#00e676";
            }
        };
        
        // Handle Disconnect
        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                endCallLogic();
            }
        };
    }

    // --- SIGNALING ---
    // This simple logic assumes a 1-on-1 connection approach via server relay

    // 1. Server tells us to make an offer (Initiator)
    socket.on('make-offer', async () => {
        createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
        if(callStatus) callStatus.innerText = "Calling...";
    });

    // 2. We received an offer (Receiver)
    socket.on('offer', async (offer) => {
        if(!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
        if(callStatus) callStatus.innerText = "Connecting...";
    });

    // 3. We received an answer
    socket.on('answer', async (answer) => {
        await peerConnection.setRemoteDescription(answer);
    });

    // 4. ICE Candidates
    socket.on('ice-candidate', async (candidate) => {
        try {
            if(peerConnection) await peerConnection.addIceCandidate(candidate);
        } catch (e) { console.error(e); }
    });

    // Hangup Logic
    if(hangupBtn) {
        hangupBtn.addEventListener('click', () => {
            endCallLogic();
            window.location.href = 'index.html'; // Go back home
        });
    }

    function endCallLogic() {
        if(peerConnection) peerConnection.close();
        if(localStream) localStream.getTracks().forEach(t => t.stop());
        peerConnection = null;
        if(callStatus) callStatus.innerText = "Ended";
    }
}