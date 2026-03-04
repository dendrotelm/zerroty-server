const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Baza aktywnych pokoi
const rooms = {};

// Funkcja do generowania 4-znakowego kodu (np. X7B9)
function generateRoomId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`[+] Podłączono: ${socket.id}`);

  // TWORZENIE POKOJU
  socket.on('createRoom', ({ playerName }) => {
    const roomId = generateRoomId();
    
    // Zapisujemy strukturę pokoju na serwerze
    rooms[roomId] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      state: 'lobby'
    };
    
    socket.join(roomId); // Dołączamy socket do kanału pokoju
    
    // Odpowiadamy twórcy, jaki ma kod, a potem odświeżamy lobby wszystkim (czyli jemu)
    socket.emit('roomCreated', { roomId });
    io.to(roomId).emit('lobbyUpdate', rooms[roomId].players);
    console.log(`Pokój ${roomId} stworzony przez ${playerName}`);
  });

  // DOŁĄCZANIE DO POKOJU
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const roomCode = roomId.toUpperCase();
    const room = rooms[roomCode];

    if (room && room.state === 'lobby') {
      if (room.players.length >= 4) {
        socket.emit('errorMsg', 'Pokój jest pełny (max 4 graczy).');
        return;
      }

      socket.join(roomCode);
      room.players.push({ id: socket.id, name: playerName, score: 0 });
      
      // Wysyłamy zaktualizowaną listę graczy do wszystkich w pokoju!
      io.to(roomCode).emit('lobbyUpdate', room.players);
      console.log(`${playerName} dołączył do ${roomCode}`);
    } else {
      socket.emit('errorMsg', 'Pokój nie istnieje lub gra już trwa!');
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Rozłączono: ${socket.id}`);
    // Docelowo tu dodamy usuwanie gracza z pokoju jak wyjdzie
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serwer Y2K online na porcie ${PORT}`);
});
