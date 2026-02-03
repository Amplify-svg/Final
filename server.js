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

// --- DATA STORAGE ---
// users structure: { "username": { password: "...", pfp: "url..." } }
const users = {}; 
let messageHistory = []; 
// specific map for socketID -> username to track online status
const connectedSockets = {}; 

io.on('connection', (socket) => {
    
    // 1. Send History immediately
    socket.emit('loadHistory', messageHistory);

    // Helper to broadcast online list
    const broadcastOnlineUsers = () => {
        // Get unique usernames from connectedSockets
        const onlineNames = [...new Set(Object.values(connectedSockets))];
        io.emit('updateUserList', onlineNames);
    };

    // --- AUTHENTICATION ---

    socket.on('register', ({ username, password }) => {
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            // Default PFP is a generic avatar
            users[username] = { password, pfp: 'https://i.pravatar.cc/150?u=' + username };
            
            // Log them in
            connectedSockets[socket.id] = username;
            socket.emit('registerResponse', { 
                success: true, 
                username: username,
                pfp: users[username].pfp
            });
            
            io.emit('message', createSystemMessage(`${username} has joined.`));
            broadcastOnlineUsers();
        }
    });

    socket.on('login', ({ username, password }) => {
        const user = users[username];
        if (user && user.password === password) {
            connectedSockets[socket.id] = username;
            
            socket.emit('loginResponse', { 
                success: true, 
                username: username,
                pfp: user.pfp 
            });
            
            io.emit('message', createSystemMessage(`${username} has joined.`));
            broadcastOnlineUsers();
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // --- CHAT FEATURES ---

    socket.on('chatMessage', (text) => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        
        const userObj = users[username];

        const msgObj = {
            id: uuidv4(),
            user: username,
            pfp: userObj.pfp, // Send PFP with message
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

    // --- TYPING INDICATOR ---
    socket.on('typing', () => {
        const username = connectedSockets[socket.id];
        if(username) socket.broadcast.emit('userTyping', username);
    });

    socket.on('stopTyping', () => {
        const username = connectedSockets[socket.id];
        if(username) socket.broadcast.emit('userStoppedTyping', username);
    });

    // --- SETTINGS / PROFILE UPDATE ---
    socket.on('updateProfile', (data) => {
        const oldName = connectedSockets[socket.id];
        if (!oldName) return;

        const { newUsername, newPassword, newPfp } = data;

        // Check if username is changing and if it's taken
        if (newUsername !== oldName && users[newUsername]) {
            socket.emit('updateProfileResponse', { success: false, message: 'Username taken' });
            return;
        }

        // Create/Migrate user data
        const oldData = users[oldName];
        
        // Delete old entry if name changed
        if (newUsername !== oldName) {
            delete users[oldName];
        }

        // Save new data
        users[newUsername] = {
            password: newPassword || oldData.password,
            pfp: newPfp || oldData.pfp
        };

        // Update socket mapping
        connectedSockets[socket.id] = newUsername;

        // Tell client success
        socket.emit('updateProfileResponse', { 
            success: true, 
            username: newUsername,
            pfp: users[newUsername].pfp 
        });

        // Refresh lists for everyone
        broadcastOnlineUsers();
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const username = connectedSockets[socket.id];
        if (username) {
            delete connectedSockets[socket.id];
            io.emit('message', createSystemMessage(`${username} has left.`));
            broadcastOnlineUsers();
        }
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