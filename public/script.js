import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCN8ypq4TxhLwjseqnDJneBO2j_BlARz0M",
    authDomain: "chat-or-somethig.firebaseapp.com",
    databaseURL: "https://chat-or-somethig-default-rtdb.firebaseio.com",
    projectId: "chat-or-somethig"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Make function accessible to HTML button
window.sendMessage = () => {
    const input = document.getElementById('messageInput');
    if (input.value) {
        push(ref(database, 'messages'), {
            text: input.value,
            username: "Nexus User", // You can replace with auth logic
            timestamp: Date.now()
        });
        input.value = '';
    }
};

// Listen for messages and render them
onChildAdded(ref(database, 'messages'), (snapshot) => {
    const msg = snapshot.val();
    const chatBox = document.getElementById('chatBox');
    const div = document.createElement('div');
    div.className = 'message-container other'; // Simplified for now
    div.innerHTML = `<div class="message-bubble">${msg.text}</div>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
});