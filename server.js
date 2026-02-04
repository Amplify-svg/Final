const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- DATA ---
const users = {}; 
let messageHistory = []; 
const connectedSockets = {}; 

io.on('connection', (socket) => {
    
    // Helper to get list of names
    const getOnlineNames = () => [...new Set(Object.values(connectedSockets))];

    const broadcastOnlineUsers = () => {
        io.emit('updateUserList', getOnlineNames());
    };

    // --- AUTH ---
    socket.on('register', ({ username, password }) => {
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            users[username] = { password, pfp: 'https://i.pravatar.cc/150?u=' + username };
            connectedSockets[socket.id] = username;
            
            socket.emit('registerResponse', { success: true, username, pfp: users[username].pfp });
            io.emit('message', createSystemMessage(`${username} has joined.`));
            
            // Send list to everyone, including new user
            broadcastOnlineUsers();
        }
    });

    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            connectedSockets[socket.id] = username;
            
            socket.emit('loginResponse', { success: true, username, pfp: user.pfp });
            
            // FIX: Send the list immediately to the user who just logged in
            socket.emit('updateUserList', getOnlineNames()); 
            
            // Then tell everyone else
            broadcastOnlineUsers();
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});