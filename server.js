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
let deletedMessages = []; // Store deleted messages for admin review
const connectedSockets = {}; // socket.id -> username
const bannedUsers = new Set(); // Banned usernames
const muteList = {}; // { username: timestamp_when_mute_expires }
const ipBanList = new Set(); // Banned IPs
const userIPs = {}; // { username: ip_address }

// Default admin user - you can change this
const ADMIN_USERNAMES = ['admin', 'administrator'];

// Initialize default admin
users['Retrick_aj'] = { 
    password: '0002042736',
    pfp: 'https://i.pravatar.cc/150?u=admin',
    isAdmin: true
};

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    
    // Capture IP address
    const clientIP = socket.handshake.address;
    console.log('Client IP:', clientIP);
    
    // Check if IP is banned
    if (ipBanList.has(clientIP)) {
        socket.emit('banned', { message: 'Your IP address is banned.' });
        socket.disconnect();
        return;
    }
    
    // Helper: Get list of online users with profile pictures
    const getOnlineNames = () => {
        const uniqueNames = [...new Set(Object.values(connectedSockets))];
        return uniqueNames.map(name => ({
            username: name,
            pfp: users[name]?.pfp || 'https://i.pravatar.cc/150?u=' + name
        }));
    };
    const broadcastOnlineUsers = () => io.emit('updateUserList', getOnlineNames());

    // --- AUTHENTICATION ---
    socket.on('register', ({ username, password }) => {
        if (bannedUsers.has(username)) {
            socket.emit('registerResponse', { success: false, message: 'This username is banned.' });
            return;
        }
        if (users[username]) {
            socket.emit('registerResponse', { success: false, message: 'Username taken.' });
        } else {
            const isAdmin = ADMIN_USERNAMES.includes(username.toLowerCase());
            users[username] = { 
                password, 
                pfp: 'https://i.pravatar.cc/150?u=' + username,
                isAdmin: isAdmin,
                isMuted: false,
                mutedUntil: 0
            };
            userIPs[username] = clientIP;
            connectedSockets[socket.id] = username;
            
            socket.emit('registerResponse', { success: true, username, pfp: users[username].pfp, isAdmin: isAdmin });
            
            broadcastOnlineUsers();
        }
    });

    socket.on('login', ({ username, password }) => {
        if (bannedUsers.has(username)) {
            socket.emit('loginResponse', { success: false, message: 'This username is banned.' });
            return;
        }
        const user = users[username];
        if (user && user.password === password) {
            userIPs[username] = clientIP;
            connectedSockets[socket.id] = username;
            const isAdmin = user.isAdmin || false;
            
            socket.emit('loginResponse', { success: true, username, pfp: user.pfp, isAdmin: isAdmin });
            socket.emit('updateUserList', getOnlineNames()); 
            broadcastOnlineUsers(); 
        } else {
            socket.emit('loginResponse', { success: false, message: 'Invalid credentials.' });
        }
    });

    // --- NEW: SYSTEM MESSAGES (JOIN/LEAVE) ---
    // This listens for the specific events we added to script.js
    socket.on('chatJoin', (username) => {
        io.emit('message', createSystemMessage(`${username} joined the chat`));
    });

    socket.on('chatLeave', (username) => {
        io.emit('message', createSystemMessage(`${username} left the chat`));
    });

    // --- CHAT & SEEN BY ---
    socket.on('chatMessage', (text) => {
        const username = connectedSockets[socket.id];
        if (!username) return;
        
        // Check if user is muted
        if (muteList[username] && muteList[username] > Date.now()) {
            socket.emit('notification', { type: 'error', message: `You are muted until ${new Date(muteList[username]).toLocaleTimeString()}` });
            return;
        }
        
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
        
        // Notify user that message was sent
        socket.emit('notification', { type: 'success', message: 'Message sent' });
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
            const deletedMsg = messageHistory.splice(index, 1)[0];
            deletedMsg.deletedBy = username;
            deletedMsg.deletedAt = new Date().toISOString();
            deletedMessages.push(deletedMsg); // Store for admin review
            io.emit('messageDeleted', id);
        }
    });

    // Admin can delete any message
    socket.on('adminDeleteMessage', ({ msgId }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('notification', { type: 'error', message: 'Not authorized' });
            return;
        }
        
        const index = messageHistory.findIndex(m => m.id === msgId);
        if (index !== -1) {
            const deletedMsg = messageHistory.splice(index, 1)[0];
            deletedMsg.deletedBy = adminUsername;
            deletedMsg.deletedAt = new Date().toISOString();
            deletedMessages.push(deletedMsg);
            io.emit('messageDeleted', msgId);
            io.emit('notification', { type: 'info', message: `Admin ${adminUsername} deleted a message` });
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
            pfp: newPfp || oldData.pfp,
            isAdmin: oldData.isAdmin || false
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
        console.log(`call-user: ${caller} -> ${userToCall}`);
        const targetSocket = findSocketId(userToCall);
        if(targetSocket) {
            io.to(targetSocket).emit('incoming-call', { from: caller, offer });
        } else {
            console.warn('call-user: targetSocket not found for', userToCall);
        }
    });

    socket.on('answer-call', ({ to, answer }) => {
        console.log('answer-call to:', to);
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('call-answered', { answer });
        } else {
            console.warn('answer-call: targetSocket not found for', to);
        }
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        console.log('ice-candidate: to=', to, 'candidate=', candidate && candidate.candidate ? candidate.candidate.substring(0,40) : candidate);
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('ice-candidate', { candidate });
        } else {
            console.warn('ice-candidate: targetSocket not found for', to);
        }
    });

    socket.on('reject-call', ({ to }) => {
        console.log('reject-call to:', to);
        const targetSocket = findSocketId(to);
        if(targetSocket) {
            io.to(targetSocket).emit('call-rejected');
        } else {
            console.warn('reject-call: targetSocket not found for', to);
        }
    });

    // ===========================================
    // --- ADMIN CONTROLS ---
    // ===========================================
    socket.on('getAdminData', () => {
        const username = connectedSockets[socket.id];
        if (!username || !users[username] || !users[username].isAdmin) {
            socket.emit('adminDataResponse', { success: false, message: 'Not authorized' });
            return;
        }

        const usersData = Object.entries(users).map(([name, data]) => {
            const userMessages = messageHistory.filter(m => m.user === name).length;
            return {
                username: name,
                pfp: data.pfp,
                isAdmin: data.isAdmin || false,
                password: data.password,
                messageCount: userMessages
            };
        });

        const onlineUsers = getOnlineNames();
        
        socket.emit('adminDataResponse', {
            success: true,
            users: usersData,
            onlineUsers: onlineUsers,
            messageCount: messageHistory.length,
            deletedMessageCount: deletedMessages.length,
            totalMessages: messageHistory,
            deletedMessages: deletedMessages
        });
    });

    socket.on('adminDeleteUser', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (users[targetUsername]) {
            delete users[targetUsername];
            io.emit('adminNotification', `Admin ${adminUsername} deleted user ${targetUsername}`);
            socket.emit('adminActionResponse', { success: true, message: `Deleted ${targetUsername}` });
        } else {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
        }
    });

    socket.on('adminUpdateUserPfp', ({ targetUsername, newPfp }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (users[targetUsername]) {
            users[targetUsername].pfp = newPfp;
            io.emit('adminNotification', `Admin ${adminUsername} updated ${targetUsername}'s avatar`);
            socket.emit('adminActionResponse', { success: true, message: `Updated ${targetUsername}'s avatar` });
        } else {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
        }
    });

    socket.on('adminClearMessages', () => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        const count = messageHistory.length;
        messageHistory = [];
        io.emit('adminNotification', `Admin ${adminUsername} cleared all messages`);
        io.emit('loadHistory', []);
        socket.emit('adminActionResponse', { success: true, message: `Cleared ${count} messages` });
    });

    socket.on('adminMakeAdmin', ({ targetUsername, makeAdmin }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (users[targetUsername]) {
            users[targetUsername].isAdmin = makeAdmin;
            const action = makeAdmin ? 'promoted to admin' : 'demoted from admin';
            io.emit('adminNotification', `Admin ${adminUsername} ${action} ${targetUsername}`);
            socket.emit('adminActionResponse', { success: true, message: `${targetUsername} ${action}` });
            socket.emit('getAdminData'); // Refresh admin data
        } else {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
        }
    });

    socket.on('adminDeleteUserData', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (!users[targetUsername]) {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
            return;
        }

        // Delete all messages from this user
        const userMessageCount = messageHistory.filter(m => m.user === targetUsername).length;
        messageHistory = messageHistory.filter(m => m.user !== targetUsername);
        
        // Delete all deleted messages from this user
        deletedMessages = deletedMessages.filter(m => m.user !== targetUsername);
        
        // Delete the user
        delete users[targetUsername];
        
        // Kick user if online
        const socketId = findSocketId(targetUsername);
        if (socketId) {
            io.to(socketId).emit('userDeleted', { message: `Your account has been deleted by admin ${adminUsername}` });
            delete connectedSockets[socketId];
        }

        io.emit('adminNotification', `Admin ${adminUsername} deleted ALL data for ${targetUsername} (${userMessageCount} messages removed)`);
        io.emit('loadHistory', messageHistory); // Refresh everyone's chat
        socket.emit('adminActionResponse', { success: true, message: `Completely deleted ${targetUsername} and all their data` });
    });

    socket.on('adminGetUserMessages', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminUserMessagesResponse', { success: false, message: 'Not authorized' });
            return;
        }

        const userMessages = messageHistory.filter(m => m.user === targetUsername);
        const userDeletedMessages = deletedMessages.filter(m => m.user === targetUsername);
        const targetUser = users[targetUsername];
        
        socket.emit('adminUserMessagesResponse', {
            success: true,
            username: targetUsername,
            pfp: targetUser ? (targetUser.pfp || 'https://i.pravatar.cc/150?u=' + targetUsername) : 'https://i.pravatar.cc/150?u=' + targetUsername,
            messages: userMessages,
            deletedMessages: userDeletedMessages
        });
    });

    // Mute user for specified duration (ms)
    socket.on('adminMuteUser', ({ targetUsername, duration }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (!users[targetUsername]) {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
            return;
        }

        muteList[targetUsername] = Date.now() + duration;
        users[targetUsername].isMuted = true;
        users[targetUsername].mutedUntil = muteList[targetUsername];
        
        io.emit('notification', { type: 'warning', message: `${targetUsername} has been muted for ${Math.round(duration / 60000)} minutes by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `Muted ${targetUsername}` });
    });

    // Unmute user
    socket.on('adminUnmuteUser', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (!users[targetUsername]) {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
            return;
        }

        delete muteList[targetUsername];
        users[targetUsername].isMuted = false;
        users[targetUsername].mutedUntil = 0;
        
        io.emit('notification', { type: 'info', message: `${targetUsername} has been unmuted by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `Unmuted ${targetUsername}` });
    });

    // Ban user (prevents login/registration)
    socket.on('adminBanUser', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (!users[targetUsername]) {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
            return;
        }

        bannedUsers.add(targetUsername);
        
        // Disconnect user if online
        const socketId = findSocketId(targetUsername);
        if (socketId) {
            io.to(socketId).emit('banned', { message: `Your account has been banned by admin ${adminUsername}` });
            delete connectedSockets[socketId];
            broadcastOnlineUsers();
        }

        io.emit('notification', { type: 'danger', message: `${targetUsername} has been banned by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `Banned ${targetUsername}` });
    });

    // Unban user
    socket.on('adminUnbanUser', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        if (!users[targetUsername]) {
            socket.emit('adminActionResponse', { success: false, message: 'User not found' });
            return;
        }

        bannedUsers.delete(targetUsername);
        io.emit('notification', { type: 'info', message: `${targetUsername} has been unbanned by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `Unbanned ${targetUsername}` });
    });

    // IP Ban
    socket.on('adminIPBan', ({ targetUsername }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        const ip = userIPs[targetUsername];
        if (!ip) {
            socket.emit('adminActionResponse', { success: false, message: 'IP not found for user' });
            return;
        }

        ipBanList.add(ip);
        bannedUsers.add(targetUsername);
        
        // Disconnect user if online
        const socketId = findSocketId(targetUsername);
        if (socketId) {
            io.to(socketId).emit('banned', { message: `Your IP has been banned by admin ${adminUsername}` });
            delete connectedSockets[socketId];
            broadcastOnlineUsers();
        }

        io.emit('notification', { type: 'danger', message: `${targetUsername} (IP: ${ip}) has been IP-banned by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `IP-Banned ${targetUsername}` });
    });

    // IP Unban
    socket.on('adminIPUnban', ({ targetIP }) => {
        const adminUsername = connectedSockets[socket.id];
        if (!adminUsername || !users[adminUsername] || !users[adminUsername].isAdmin) {
            socket.emit('adminActionResponse', { success: false, message: 'Not authorized' });
            return;
        }

        ipBanList.delete(targetIP);
        io.emit('notification', { type: 'info', message: `IP ${targetIP} has been unbanned by admin ${adminUsername}` });
        socket.emit('adminActionResponse', { success: true, message: `Unbanned IP ${targetIP}` });
    });

    socket.on('disconnect', () => {
        const username = connectedSockets[socket.id];
        console.log('Socket disconnected:', socket.id, 'username:', username);
        if (username) {
            // We do NOT emit "left chat" here because script.js sends 'chatLeave' 
            // automatically when the tab closes or navigates.
            delete connectedSockets[socket.id];
            broadcastOnlineUsers();
        }
    });
});

function findSocketId(username) {
    for (const [socketId, name] of Object.entries(connectedSockets)) {
        if (name === username) return socketId;
    }
    return null;
}

function createSystemMessage(text) {
    return { id: uuidv4(), user: 'System', text: text, timestamp: new Date().toISOString(), seenBy: [] };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});