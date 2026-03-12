let socket = null;

// Authentication
async function signIn() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Email and password required');
        return;
    }

    try {
        log(`Signing in as ${email}...`, 'sent');

        const response = await fetch('/api/auth/sign-in', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password})
        });

        // Vérifie que la réponse est bien du JSON (et pas une page d'erreur HTML)
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server error: Expected JSON response but got HTML. Is the server running?');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Sign in failed');
        }

        log(`✅ Signed in successfully! Token received.`, 'received');

        // Récupère le token et connecte le socket
        document.getElementById('token').value = data.token;
        connectWithToken(data.token);

    } catch (error) {
        log(`❌ Sign in error: ${error.message}`, 'error');
        alert('Sign in failed: ' + error.message);
    }
}

// Gestion des connexions
function connectWithToken(token) {
    if (!token) {
        alert('Please enter a JWT token');
        return;
    }

    socket = io({
        auth: {token}
    });

    socket.on('connect', () => {
        log('Connected', 'received');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').className = 'status connected';
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;
    });

    socket.on('disconnect', () => {
        log('Disconnected', 'error');
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').className = 'status disconnected';
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('disconnectBtn').disabled = true;
    });

    socket.on('connect_error', (error) => {
        log('Connection error: ' + error.message, 'error');
    });

    // Listen to all server events
    socket.onAny((eventName, ...args) => {
        log(`⬅️ ${eventName}: ${JSON.stringify(args, null, 2)}`, 'received');
    });
}

document.getElementById('connectBtn').addEventListener('click', () => {
    const token = document.getElementById('token').value;
    connectWithToken(token);
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
    if (socket) {
        socket.disconnect();
    }
});

// Room events
function getRooms() {
    if (!socket) return alert('Not connected');
    log('➡️ listWaitingRooms', 'sent');
    socket.emit('listWaitingRooms', (response) => {
        log(`⬅️ listWaitingRooms: ${JSON.stringify(response, null, 2)}`, 'received');
    });
}

function createRoom() {
    if (!socket) return alert('Not connected');
    const deckId = parseInt(document.getElementById('createRoomDeckId').value);
    if (!deckId) return alert('Deck ID required');

    const data = {deckId};
    log(`➡️ createRoom: ${JSON.stringify(data)}`, 'sent');
    socket.emit('createRoom', data, (response) => {
        log(`⬅️ createRoom: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

function joinRoom() {
    if (!socket) return alert('Not connected');
    const roomId = parseInt(document.getElementById('joinRoomId').value);
    const deckId = parseInt(document.getElementById('joinRoomDeckId').value);
    if (!roomId || !deckId) return alert('Room ID and Deck ID required');

    const data = {roomId, deckId, username: 'Player'};
    log(`➡️ joinRoom: ${JSON.stringify(data)}`, 'sent');
    socket.emit('joinRoom', data, (response) => {
        log(`⬅️ joinRoom: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

// Game events
function drawCards() {
    if (!socket) return alert('Not connected');
    const roomId = parseInt(document.getElementById('drawCardsRoomId').value);
    if (!roomId) return alert('Room ID required');

    const data = {roomId};
    log(`➡️ drawCards: ${JSON.stringify(data)}`, 'sent');
    socket.emit('drawCards', data, (response) => {
        log(`⬅️ drawCards: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

function playCard() {
    if (!socket) return alert('Not connected');
    const roomId = parseInt(document.getElementById('playCardRoomId').value);
    const cardIndex = parseInt(document.getElementById('playCardIndex').value);
    if (!roomId || isNaN(cardIndex)) return alert('Room ID and Card Index required');

    const data = {roomId, cardIndex};
    log(`➡️ playCard: ${JSON.stringify(data)}`, 'sent');
    socket.emit('playCard', data, (response) => {
        log(`⬅️ playCard: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

function attack() {
    if (!socket) return alert('Not connected');
    const roomId = parseInt(document.getElementById('attackRoomId').value);
    if (!roomId) return alert('Room ID required');

    const data = {roomId};
    log(`➡️ attack: ${JSON.stringify(data)}`, 'sent');
    socket.emit('attack', data, (response) => {
        log(`⬅️ attack: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

function endTurn() {
    if (!socket) return alert('Not connected');
    const roomId = parseInt(document.getElementById('endTurnRoomId').value);
    if (!roomId) return alert('Room ID required');

    const data = {roomId};
    log(`➡️ endTurn: ${JSON.stringify(data)}`, 'sent');
    socket.emit('endTurn', data, (response) => {
        log(`⬅️ endTurn: ${JSON.stringify(response, null, 2)}`, response.success ? 'received' : 'error');
    });
}

// Logs
function log(message, type = 'info') {
    const logs = document.getElementById('logs');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
}

function clearLogs() {
    document.getElementById('logs').innerHTML = '';
}
