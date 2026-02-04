const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- DATA STORAGE ---
const users = {}; 
let messageHistory = []; 
const connectedSockets = {}; // socket.id -> username

io.on('connection', (socket) => {
    
    // Helper: Get list of unique usernames
    const getOnlineNames = () => [...new Set(Object.values(connectedSockets))];
    const broadcastOnlineUsers = () => io.emit('updateUserList', getOnlineNames());

    // --- AUTHENTICATION ---
    socket.on('register', ({ username, password }) => {
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            users[username] = { password, pfp: 'https://i.pravatar.cc/150?u=' + username };
            connectedSockets[socket.id] = username;
            
            socket.emit('registerResponse', { success: true, username, pfp: users[username].pfp });
            io.emit('message', createSystemMessage(`${username} has joined.`));
            
            broadcastOnlineUsers();
        }
    });

    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            connectedSockets[socket.id] = username;
            
            socket.emit('loginResponse', { success: true, username, pfp: user.pfp });
            socket.emit('updateUserList', getOnlineNames()); // Send list immediately to user
            broadcastOnlineUsers(); // Update everyone else
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // --- CHAT & SEEN BY ---
    socket.on('chatMessage', (text) => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        
        const msgObj = {
            id: uuidv4(),
            user: username,
            pfp: users[username].pfp,
            text: text,
            timestamp: new Date().toISOString(),
            seenBy: [username]
        };
        
        messageHistory.push(msgObj);
        if (messageHistory.length > 100) messageHistory.shift();
        io.emit('message', msgObj);
    });

    socket.on('markSeen', (msgId) => {
        const username = connectedSockets[socket.id];
        if (!username) return;

        const msg = messageHistory.find(m => m.id === msgId);
        if (msg && !msg.seenBy.includes(username)) {
            msg.seenBy.push(username);
            io.emit('messageUpdated', msg);
        }
    });

    socket.on('markAllSeen', () => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        
        messageHistory.slice(-20).forEach(msg => {
            if (!msg.seenBy.includes(username)) {
                msg.seenBy.push(username);
                io.emit('messageUpdated', msg);
            }
        });
    });

    socket.on('deleteMessage', (id) => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        const index = messageHistory.findIndex(m => m.id === id);
        if (index !== -1 && messageHistory[index].user === username) {
            messageHistory.splice(index, 1);
            io.emit('messageDeleted', id);
        }
    });

    socket.on('loadHistory', () => {
        socket.emit('loadHistory', messageHistory);
    });

    socket.on('typing', () => {
        const username = connectedSockets[socket.id];
        if(username) socket.broadcast.emit('userTyping', username);
    });

    socket.on('stopTyping', () => {
        const username = connectedSockets[socket.id];
        if(username) socket.broadcast.emit('userStoppedTyping', username);
    });

    socket.on('updateProfile', (data) => {
        const oldName = connectedSockets[socket.id];
        if (!oldName) return;
        const { newUsername, newPassword, newPfp } = data;

        if (newUsername !== oldName && users[newUsername]) {
            socket.emit('updateProfileResponse', { success: false, message: 'Username taken' });
            return;
        }

        const oldData = users[oldName];
        if (newUsername !== oldName) delete users[oldName];

        users[newUsername] = {
            password: newPassword || oldData.password,
            pfp: newPfp || oldData.pfp
        };

        connectedSockets[socket.id] = newUsername;
        socket.emit('updateProfileResponse', { success: true, username: newUsername, pfp: users[newUsername].pfp });
        
        if (newUsername !== oldName) {
            io.emit('message', createSystemMessage(`${oldName} is now ${newUsername}.`));
            broadcastOnlineUsers();
        }
    });

    // ===========================================
    // --- VIDEO CALL SIGNALING (WEBRTC) ---
    // ===========================================
    function findSocketId(username) {
        return Object.keys(connectedSockets).find(id => connectedSockets[id] === username);
    }

    socket.on('call-user', ({ userToCall, offer }) => {
        const caller = connectedSockets[socket.id];
        const targetSocket = findSocketId(userToCall);
        if(targetSocket) {
            io.to(targetSocket).emit('incoming-call', { from: caller, offer });
        }
    });

    socket.on('answer-call', ({ to, answer }) => {
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('call-answered', { answer });
        }
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('ice-candidate', { candidate });
        }
    });

    socket.on('reject-call', ({ to }) => {
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('call-rejected');
        }
    });

    socket.on('disconnect', () => {
        const username = connectedSockets[socket.id];
        if (username) {
            delete connectedSockets[socket.id];
            broadcastOnlineUsers();
        }
    });
});

function createSystemMessage(text) {
    return { id: uuidv4(), user: 'System', text: text, timestamp: new Date().toISOString(), seenBy: [] };
}

// ------------------------------------------------------------------
// ICE config endpoint
// Returns an object { iceServers: [...] } which can include TURN
// Use environment variables to configure TURN:
//   TURN_URL (comma-separated), TURN_USERNAME, TURN_CREDENTIAL
// Example: TURN_URL=turn:my.turn.server:3478,turn:my.turn.server:5349
// ------------------------------------------------------------------
app.get('/ice-config', (req, res) => {
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ];

    const turnUrl = process.env.TURN_URL; // comma separated if multiple
    if (turnUrl && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        const urls = turnUrl.split(',').map(u => u.trim()).filter(Boolean);
        if (urls.length) {
            iceServers.push({
                urls,
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_CREDENTIAL
            });
            console.log('Added TURN server to ICE config.');
        }
    }

    res.json({ iceServers });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});