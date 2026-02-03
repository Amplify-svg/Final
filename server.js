// server.js
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
    
    // Send history immediately (only useful if they are on chat page)
    socket.emit('loadHistory', messageHistory);

    const broadcastOnlineUsers = () => {
        const onlineNames = [...new Set(Object.values(connectedSockets))];
        io.emit('updateUserList', onlineNames);
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
            broadcastOnlineUsers();
        }
    });

    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            connectedSockets[socket.id] = username;
            socket.emit('loginResponse', { success: true, username, pfp: user.pfp });
            broadcastOnlineUsers();
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // --- CHAT ---
    socket.on('chatMessage', (text) => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        
        const msgObj = {
            id: uuidv4(),
            user: username,
            pfp: users[username].pfp,
            text: text,
            timestamp: new Date().toISOString()
        };
        
        messageHistory.push(msgObj);
        if (messageHistory.length > 100) messageHistory.shift();
        io.emit('message', msgObj);
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

        socket.emit('updateProfileResponse', { 
            success: true, username: newUsername, pfp: users[newUsername].pfp 
        });
        broadcastOnlineUsers();
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
    return { id: uuidv4(), user: 'System', text: text, timestamp: new Date().toISOString() };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});