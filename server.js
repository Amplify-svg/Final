const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// History array to store messages while the server is awake
let messageHistory = [];

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // Send existing messages to the user who just joined
    socket.emit('load history', messageHistory);

    socket.on('chat message', (data) => {
        const msgWithTime = {
            ...data,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        messageHistory.push(msgWithTime);
        if (messageHistory.length > 100) messageHistory.shift(); // Keep last 100

        io.emit('chat message', msgWithTime);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Nexus Server: http://localhost:${PORT}`));