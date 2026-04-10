const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let allQuestions = [];
try {
  allQuestions = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
  console.log(`[OK] Załadowano ${allQuestions.length} pytań z bazy.`);
} catch(e) {
  console.log("⚠️ BŁĄD: Brak pliku questions.json. Ładuję awaryjne.");
  allQuestions = [{"category": "BŁĄD", "question": "Brak pytań", "answers": ["Ok", "Ok", "Ok", "Ok"], "correct": 0}];
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
      timeLeft: 30,
      isPaused: false,
      answers: {},
      questionStartTime: 0,
      pauseTime: 0
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
    io.to(roomId).emit('lobbyUpdate', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId.toUpperCase()];
    if (room && room.state === 'lobby' && room.players.length < 4) {
      socket.join(roomId.toUpperCase());
      room.players.push({ id: socket.id, name: playerName, score: 0 });
      io.to(roomId.toUpperCase()).emit('lobbyUpdate', room.players);
    } else {
      socket.emit('errorMsg', 'Pokój pełny lub nie istnieje!');
    }
  });

  // START GRY (Odbiera ilość rund i kategorie)
  socket.on('startGame', ({ roomId, roundsCount, categories }) => {
    const room = rooms[roomId];
    if (room && room.host === socket.id && room.state === 'lobby') {
      room.state = 'playing';
      const totalQuestions = roundsCount || 10;
      
      // Filtrowanie pytań
      let pool = allQuestions;
      if (categories && categories.length > 0) {
        pool = allQuestions.filter(q => categories.includes(q.category));
      }
      if (pool.length === 0) pool = allQuestions; // Zabezpieczenie, gdyby wybrano puste

      room.questions = [...pool].sort(() => 0.5 - Math.random()).slice(0, totalQuestions);
      room.currentQuestionIndex = 0;
      io.to(roomId).emit('gameStarted', { players: room.players });
      sendNextQuestion(roomId);
    }
  });

  // PAUZA ONLINE
  socket.on('togglePause', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.host === socket.id && room.state === 'playing') {
      room.isPaused = !room.isPaused;
      
      if (room.isPaused) {
        clearInterval(room.timer);
        room.pauseTime = Date.now();
        io.to(roomId).emit('gamePaused');
      } else {
        // Wznowienie - dodajemy czas spędzony na pauzie, by bonusy za szybkość były sprawiedliwe
        room.questionStartTime += (Date.now() - room.pauseTime);
        startRoomTimer(roomId);
        io.to(roomId).emit('gameResumed');
      }
    }
  });

  // OPUSZCZANIE POKOJU
  socket.on('leaveRoom', ({ roomId }) => {
    const room = rooms[roomId];
    if (room) {
      socket.leave(roomId);
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else if (room.host === socket.id) {
        // Jeśli Host wyjdzie, zamykamy pokój wszystkim
        io.to(roomId).emit('errorMsg', 'Host opuścił grę. Pokój został zamknięty.');
        io.to(roomId).emit('gameOver', { players: room.players });
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('lobbyUpdate', room.players);
      }
    }
  });

  socket.on('submitAnswer', ({ roomId, answerIndex }) => {
    const room = rooms[roomId];
    if (room && room.state === 'playing' && !room.isPaused && !room.answers[socket.id]) {
      const timeElapsed = (Date.now() - room.questionStartTime) / 1000;
      room.answers[socket.id] = { index: answerIndex, time: timeElapsed };
      
      if (Object.keys(room.answers).length === room.players.length) endRound(roomId);
    }
  });

  function startRoomTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    clearInterval(room.timer);
    room.timer = setInterval(() => {
      if (!room.isPaused) {
        room.timeLeft--;
        io.to(roomId).emit('timerTick', room.timeLeft);
        if (room.timeLeft <= 0) endRound(roomId);
      }
    }, 1000);
  }

  function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    if (room.currentQuestionIndex >= room.questions.length) {
      io.to(roomId).emit('gameOver', { players: room.players });
      delete rooms[roomId];
      return;
    }

    room.answers = {}; 
    const q = room.questions[room.currentQuestionIndex];
    const safeQuestion = { category: q.category, question: q.question, answers: q.answers };
    
    room.questionStartTime = Date.now();
    room.timeLeft = 30;
    room.isPaused = false;
    
    io.to(roomId).emit('newQuestion', {
      question: safeQuestion,
      qNumber: room.currentQuestionIndex + 1,
      total: room.questions.length
    });

    startRoomTimer(roomId);
  }

  function endRound(roomId) {
    const room = rooms[roomId];
    if(!room) return;
    clearInterval(room.timer); 
    const currentQ = room.questions[room.currentQuestionIndex];

    const simpleAnswersForFrontend = {};
    for (let [socketId, answerData] of Object.entries(room.answers)) {
      simpleAnswersForFrontend[socketId] = answerData.index; 
      if (answerData.index === currentQ.correct) {
        const player = room.players.find(p => p.id === socketId);
        if (player) {
          const speedBonus = Math.max(0, 30 - Math.floor(answerData.time)); 
          player.score += (10 + speedBonus);
        }
      }
    }

    io.to(roomId).emit('roundResult', {
      correctIndex: currentQ.correct,
      answers: simpleAnswersForFrontend,
      players: room.players
    });

    room.currentQuestionIndex++;
    setTimeout(() => sendNextQuestion(roomId), 5000); 
  }
});

server.listen(3000, () => console.log(`🚀 Serwer nasłuchuje!`)); 
