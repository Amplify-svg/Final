const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    transports: ['websocket'] // Required for stable Render connections
});

app.use(express.static(path.join(__dirname, 'public')));

// --- NEW: History Storage ---
let messageHistory = []; 
const MAX_HISTORY = 50; // Keep the last 50 messages so the server doesn't get slow

io.on('connection', (socket) => {
    console.log('User connected');

    // --- NEW: Send history to the new user immediately ---
    socket.emit('load history', messageHistory);

    socket.on('chat message', (data) => {
        // Build the message object
        const messageData = {
            user: data.user,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // Save to history
        messageHistory.push(messageData);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

        // Broadcast to everyone
        io.emit('chat message', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));