// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory storage for users (Resets on server restart!)
const users = {}; 

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    let currentUser = null;

    // Handle Account Creation
    socket.on('register', ({ username, password }) => {
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            users[username] = { password }; // In production, hash this password!
            socket.emit('registerResponse', { success: true, message: 'Account created! Please log in.' });
        }
    });

    // Handle Login
    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            currentUser = username;
            socket.emit('loginResponse', { success: true, username: username });
            io.emit('message', { user: 'System', text: `${username} has joined the chat.` });
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // Handle Chat Messages
    socket.on('chatMessage', (msg) => {
        if (!currentUser) return; // Prevent chatting if not logged in
        // Broadcast to everyone
        io.emit('message', { user: currentUser, text: msg });
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            io.emit('message', { user: 'System', text: `${currentUser} has left.` });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});