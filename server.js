const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// Wczytywanie pytań na serwerze!
let allQuestions = [];
try {
  allQuestions = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
  console.log(`[OK] Załadowano ${allQuestions.length} pytań z bazy.`);
} catch(e) {
  console.log("⚠️ BŁĄD: Nie znaleziono pliku questions.json w folderze zerroty-server!");
  console.log("⚠️ Ładuję pytanie awaryjne, żeby gra nie wybuchła.");
  allQuestions = [
    {"category": "BŁĄD SERWERA", "question": "Zapomniałeś skopiować pliku questions.json do folderu serwera!", "answers": ["Ups", "Zaraz to zrobię", "Moja wina", "Poprawię to"], "correct": 1}
  ];
}

const rooms = {};
function generateRoomId() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }

io.on('connection', (socket) => {
  socket.on('createRoom', ({ playerName }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      id: roomId,
      host: socket.id,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      state: 'lobby',
      questions: [],
      currentQuestionIndex: 0,
      timer: null,
      answers: {}
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
    io.to(roomId).emit('lobbyUpdate', rooms[roomId].players);
    console.log(`[POKÓJ] Utworzono pokój ${roomId} przez ${playerName}`);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId.toUpperCase()];
    if (room && room.state === 'lobby' && room.players.length < 4) {
      socket.join(roomId.toUpperCase());
      room.players.push({ id: socket.id, name: playerName, score: 0 });
      io.to(roomId.toUpperCase()).emit('lobbyUpdate', room.players);
      console.log(`[POKÓJ] ${playerName} dołączył do ${roomId.toUpperCase()}`);
    } else {
      socket.emit('errorMsg', 'Pokój jest pełny, nie istnieje lub gra trwa!');
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    console.log(`[START] Otrzymano żądanie startu dla pokoju: ${roomId}`);
    
    if (!room) {
      console.log(`[START BŁĄD] Pokój nie istnieje.`);
      return socket.emit('errorMsg', 'Błąd: Pokój nie istnieje na serwerze.');
    }
    
    // Złagodzona zasada - pozwalamy wystartować z pokoju lobby bez restrykcji ID
    if (room.state === 'lobby') {
      console.log(`[START] Uruchamiam grę w pokoju ${roomId}!`);
      room.state = 'playing';
      room.questions = [...allQuestions].sort(() => 0.5 - Math.random()).slice(0, 10);
      room.currentQuestionIndex = 0;
      io.to(roomId).emit('gameStarted', { players: room.players });
      sendNextQuestion(roomId);
    } else {
      console.log(`[START BŁĄD] Gra w tym pokoju już trwa!`);
    }
  });

  socket.on('submitAnswer', ({ roomId, answerIndex }) => {
    const room = rooms[roomId];
    if (room && room.state === 'playing') {
      room.answers[socket.id] = answerIndex; 
      console.log(`[ODPOWIEDŹ] Pokój ${roomId}: Gracz zaznaczył opcję ${answerIndex}`);
      
      if (Object.keys(room.answers).length === room.players.length) {
        console.log(`[RUNDA] Wszyscy odpowiedzieli w pokoju ${roomId}. Ucinam czas!`);
        endRound(roomId);
      }
    }
  });

  function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    if (room.currentQuestionIndex >= room.questions.length) {
      console.log(`[KONIEC] Koniec pytań w pokoju ${roomId}`);
      io.to(roomId).emit('gameOver', { players: room.players });
      delete rooms[roomId];
      return;
    }

    room.answers = {}; 
    const q = room.questions[room.currentQuestionIndex];
    const safeQuestion = { category: q.category, question: q.question, answers: q.answers };
    
    console.log(`[PYTANIE] Pokój ${roomId} dostaje pytanie: ${q.question}`);
    
    io.to(roomId).emit('newQuestion', {
      question: safeQuestion,
      qNumber: room.currentQuestionIndex + 1,
      total: room.questions.length
    });

    let timeLeft = 30;
    clearInterval(room.timer);
    room.timer = setInterval(() => {
      timeLeft--;
      io.to(roomId).emit('timerTick', timeLeft);
      
      if (timeLeft <= 0) {
         console.log(`[CZAS MINĄŁ] Pokój ${roomId}`);
         endRound(roomId); 
      }
    }, 1000);
  }

  function endRound(roomId) {
    const room = rooms[roomId];
    if(!room) return;
    clearInterval(room.timer); 
    const currentQ = room.questions[room.currentQuestionIndex];

    for (let [socketId, ansIdx] of Object.entries(room.answers)) {
      if (ansIdx === currentQ.correct) {
        const player = room.players.find(p => p.id === socketId);
        if (player) player.score += 1;
      }
    }

    io.to(roomId).emit('roundResult', {
      correctIndex: currentQ.correct,
      answers: room.answers,
      players: room.players
    });

    room.currentQuestionIndex++;
    // Przerwa na pokazanie, kto co zaznaczył (5 sekund)
    setTimeout(() => sendNextQuestion(roomId), 5000); 
  }
  
  socket.on('disconnect', () => {
     console.log(`[-] Rozłączono: ${socket.id}`);
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Serwer Y2K nasłuchuje na porcie ${PORT}`)); 
