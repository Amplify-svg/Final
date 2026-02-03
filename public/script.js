const socket = io({ transports: ['websocket'] });

// --- NEW: Username Setup ---
let username = prompt("What is your name?") || "Anonymous";

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');

// Helper function to show a message on screen
function addMessageToUI(data) {
    const item = document.createElement('li');
    // Styling the message: "Time | Name: Message"
    item.innerHTML = `<small style="color: gray;">${data.time}</small> <b>${data.user}:</b> ${data.text}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        // Send an OBJECT instead of just text
        socket.emit('chat message', {
            user: username,
            text: input.value
        });
        input.value = '';
    }
});

// --- NEW: Listen for History ---
socket.on('load history', (history) => {
    messages.innerHTML = ''; // Clear current view
    history.forEach(msg => addMessageToUI(msg));
});

socket.on('chat message', (data) => {
    addMessageToUI(data);
});