const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Konfiguration für Socket.io (erlaubt Zugriff von überall)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Hier speichern wir temporär, welcher User welche Socket-ID hat
// Map: Public_Key_String -> Socket_ID
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log(`[INFO] Neue Verbindung: ${socket.id}`);

    // 1. User registriert sich mit seinem Public Key (aus Rust)
    socket.on('register', (publicKey) => {
        connectedUsers.set(publicKey, socket.id);
        socket.publicKey = publicKey; // Speichern am Socket-Objekt für Cleanup
        console.log(`[AUTH] User registriert: ${publicKey.substring(0, 10)}...`);

        // Bestätigung an den Client senden
        socket.emit('registered', { success: true });
    });

    // 2. User A will User B anrufen (Handshake Init)
    socket.on('request-connection', ({ targetId, fromId, offer }) => {
        const targetSocketId = connectedUsers.get(targetId);

        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-connection', {
                from: fromId, // Wir leiten einfach weiter, was der Client sagt
                offer: offer
            });
            console.log(`[SIGNAL] Verbindung von ${fromId.substring(0,6)} an ${targetId.substring(0,6)}`);
        } else {
            socket.emit('error', { message: `User ${targetId} ist offline.` });
        }
    });

    // 3. User B nimmt an (Handshake Antwort)
    socket.on('accept-connection', ({ targetId, answer }) => {
        const targetSocketId = connectedUsers.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('connection-accepted', {
                from: socket.publicKey,
                answer: answer
            });
        }
    });

    // 4. ICE Candidates (Netzwerk-Route austauschen)
    socket.on('ice-candidate', ({ targetId, candidate }) => {
        const targetSocketId = connectedUsers.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                from: socket.publicKey,
                candidate: candidate
            });
        }
    });

    // Cleanup wenn User geht
    socket.on('disconnect', () => {
        if (socket.publicKey) {
            connectedUsers.delete(socket.publicKey);
            console.log(`[INFO] User ${socket.publicKey.substring(0, 10)}... disconnected.`);
        }
    });
});

const PORT = 3001;

// HIER IST DER FIX: Füge "0.0.0.0" hinzu!
server.listen(PORT, "0.0.0.0", () => {
    console.log(`--- SIGNALING SERVER ONLINE AUF PORT ${PORT} (IPv4 FORCED) ---`);
    console.log(`Waiting for ghost protocols...`);
});