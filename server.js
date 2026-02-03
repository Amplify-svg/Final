// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Generates unique IDs

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- DATA STORAGE (Resets when Render restarts) ---
const users = {};
let messageHistory = []; // Stores objects: { id, user, text, timestamp }

io.on('connection', (socket) => {
    let currentUser = null;

    // 1. Send existing chat history to the new user
    socket.emit('loadHistory', messageHistory);

    // 2. Register
    socket.on('register', ({ username, password }) => {
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            users[username] = { password };
            // Auto-log them in immediately
            currentUser = username;
            socket.emit('registerResponse', { success: true, username: username });
            io.emit('message', createSystemMessage(`${username} has joined.`));
        }
    });

    // 3. Login
    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            currentUser = username;
            socket.emit('loginResponse', { success: true, username: username });
            io.emit('message', createSystemMessage(`${username} has joined.`));
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // 4. Handle Chat Messages
    socket.on('chatMessage', (text) => {
        if (!currentUser) return;
        
        const msgObj = {
            id: uuidv4(),
            user: currentUser,
            text: text,
            timestamp: new Date().toISOString() // Save raw time
        };
        
        messageHistory.push(msgObj);
        
        // Keep history limited to last 100 messages
        if (messageHistory.length > 100) messageHistory.shift();

        io.emit('message', msgObj);
    });

    // 5. Handle Message Deletion
    socket.on('deleteMessage', (id) => {
        if (!currentUser) return;

        const index = messageHistory.findIndex(m => m.id === id);
        
        // Security Check: Does message exist AND did the current user write it?
        if (index !== -1 && messageHistory[index].user === currentUser) {
            messageHistory.splice(index, 1); // Remove from server memory
            io.emit('messageDeleted', id);   // Tell all clients to remove it
        }
    });

    socket.on('disconnect', () => {
        // Optional: Announce disconnection
    });
});

function createSystemMessage(text) {
    return {
        id: uuidv4(),
        user: 'System',
        text: text,
        timestamp: new Date().toISOString()
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});