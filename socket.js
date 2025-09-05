const getClient = require("./db/mongo");
const { ObjectId } = require("mongodb");
const { updateStats } = require("./controllers/userController");
const activeQuestions = {};
const timers = {};

module.exports = function initSockets(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Usuario conectado:", socket.id);

    // Listar salas existentes
    socket.on("getRooms", async () => {
      const client = await getClient();
      const db = client.db("trivia");
      const rooms = await db.collection("rooms").find({status: "waiting" }).toArray();
      socket.emit("roomList", rooms);
    });

    // Crear sala
    socket.on("createRoom", async ({ userId, name, imageUrl }) => {
      const client = await getClient();
      const db = client.db("trivia");

      const room = {
        roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        players: [{ userId, name, status: "alive", joinedAt: new Date(), imageUrl }],
        status: "waiting",
        maxPlayers: 2,
        winner: null,
        createdAt: new Date(),
      };

      await db.collection("rooms").insertOne(room);

      socket.join(room.roomCode);

      // Notificamos a todos la nueva lista de salas
      const rooms = await db.collection("rooms").find({status: "waiting"}).toArray();
      io.emit("roomList", rooms);

      // Notificamos a los de esa sala
      io.to(room.roomCode).emit("roomUpdate", room);
    });

    
    // Unirse a sala
socket.on("joinRoom", async ({ roomCode, userId, name, imageUrl }) => {
  const client = await getClient();
  const db = client.db("trivia");

  const room = await db.collection("rooms").findOne({ roomCode });

  if (!room) {
    socket.emit("error", { error: "Sala no encontrada" });
    return;
  }

  if (room.players.length >= room.maxPlayers) {
    socket.emit("error", { error: "La sala está llena" });
    return;
  }

  if (room.players.find((p) => p.userId === userId)) {
    socket.emit("error", { error: "Ya estás en la sala" });
    return;
  }

  const newPlayer = { 
    userId, 
    name, 
    status: "alive", 
    joinedAt: new Date(), 
    socketId: socket.id,   // 👈 guardamos socketId
    imageUrl
  };

  await db.collection("rooms").updateOne(
    { roomCode },
    { $push: { players: newPlayer } }
  );

  // 👇 aseguramos que este socket se meta al canal
  socket.join(roomCode);

  const updatedRoom = await db.collection("rooms").findOne({ roomCode });

  // Notificar a todos en la sala
  io.to(roomCode).emit("roomUpdate", updatedRoom);

  // Actualizar lista global
  const rooms = await db.collection("rooms").find({status: "waiting"}).toArray();
  io.emit("roomList", rooms);

  // 🚀 Si la sala llega a 5 jugadores → arrancamos el juego
  if (updatedRoom.players.length === updatedRoom.maxPlayers) {
    await db.collection("rooms").updateOne(
      { roomCode: updatedRoom.roomCode },
      { $set: { status: "playing", startedAt: new Date() } }
    );
    io.to(updatedRoom.roomCode).emit("startGame", { roomCode: updatedRoom.roomCode }); // 👈 ahora sí todos

    console.log("🚀 Iniciando ruleta...");
    const categories = ["Ciencia", "Arte", "Historia", "Geografía", "Deportes", "Tecnología"];
    const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
    io.to(updatedRoom.roomCode).emit("startRoulette", selectedCategory);  // 👈 pasarla aquí
  }
});


    // Salir de sala
    socket.on("leaveRoom", async ({ roomCode, userId }) => {
      const client = await getClient();
      const db = client.db("trivia");

      await db.collection("rooms").updateOne(
        { roomCode },
        { $pull: { players: { userId } } }
      );

      socket.leave(roomCode);

      const updatedRoom = await db.collection("rooms").findOne({ roomCode });
      io.to(roomCode).emit("roomUpdate", updatedRoom);

      const rooms = await db.collection("rooms").find({status: "waiting"}).toArray();
      io.emit("roomList", rooms);
    });
  
  
    socket.on("getRoomState", async ({ roomCode }) => {
      const client = await getClient();
      const db = client.db("trivia");

      const room = await db.collection("rooms").findOne({ roomCode });
      if (!room) return;

      const questionData = activeQuestions[roomCode];

      const phase =
        room.status === "waiting"
          ? "waiting"
          : room.status === "finished"
          ? "result"
          : questionData
          ? "question"
          : "roulette";

      socket.emit("roomState", {
        phase,
        category: questionData?.category || null,
        question: questionData
          ? {
              text: questionData.text,
              options: questionData.options,
              difficulty: questionData.difficulty,
              timeLimit: 5,
            }
          : null,
      });
    });




// Cuando la ruleta termina → elegir categoría y mandar pregunta
socket.on("rouletteFinished", async ({ roomCode, category }) => {
  const client = await getClient();
  const db = client.db("trivia");

  const room = await db.collection("rooms").findOne({ roomCode });
  if (!room) return;
  const selectedCategory = category;

  setTimeout(async () => {
    const question = await db.collection("preguntas").aggregate([
      { $match: { categoria: selectedCategory } },
      { $sample: { size: 1 } }
  ]).toArray();

  if (question[0]) {
    const { enunciado, opciones, respuestaCorrecta, dificultad } = question[0];
    const alivePlayers = room.players.filter(p => p.status === "alive");

    activeQuestions[roomCode] = {
      correct: respuestaCorrecta,
      _id: question[0]._id,
      answers: {},
      expectedPlayers: alivePlayers.map(p => p.userId),
      category: selectedCategory
    };

    io.to(roomCode).emit("newQuestion", {
      text: enunciado,
      options: opciones,
      difficulty: dificultad,
      timeLimit: 5
    });

    timers[roomCode] = setTimeout(async () => {

      const room = await db.collection("rooms").findOne({ roomCode });
      if (!room) return;

      const questionData = activeQuestions[roomCode];
      if (!questionData) return;
      if (!questionData.processedUsers) questionData.processedUsers = new Set();


      for (const player of room.players) {
        const hasAnswered = questionData.answers.hasOwnProperty(player.userId);
        const isAlive = player.status === "alive";

        console.log(`[🔍 TIMEOUT CHECK] player ${player.name} (ID: ${player.userId}) answered?`, hasAnswered);
        console.log(`[📦 ALL ANSWERS]`, questionData.answers);


        if (!hasAnswered && isAlive && !questionData.processedUsers.has(player.userId)) {
          questionData.processedUsers.add(player.userId);
          
          const result = await db.collection("rooms").updateOne(
            {
              roomCode,
              players: { $elemMatch: { userId: player.userId } }
            },
            {
              $set: { "players.$.status": "eliminated" }
            }
          );
          console.log(`[⚠️ Eliminating] ${player.name} – Modified: ${result.modifiedCount}`);
          io.to(player.socketId).emit("roundResult", { status: "timeout" });
          await updateStats({
            userId: player.userId,
            username: player.name,
            correct: false,
            category: questionData.category
          });
        }
      }
        // 🔁 Reobtener la sala actualizada y emitirla
      const updatedRoom = await db.collection("rooms").findOne({ roomCode });
      io.to(roomCode).emit("roomUpdate", updatedRoom);
        
      const alive = updatedRoom.players.filter(p => p.status === "alive");

      if (alive.length === 1) {
        const winner = alive[0];
        await db.collection("rooms").updateOne(
          { roomCode },
          { $set: { winner: winner.userId, status: "finished" } }
        );
        io.to(roomCode).emit("gameWinner", winner);
      } else if (alive.length > 1) {
        delete activeQuestions[roomCode];
        const categories = ["Ciencia", "Arte", "Historia", "Geografía", "Deportes", "Tecnología"];
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
        io.to(roomCode).emit("startRoulette", selectedCategory);
        
      }else {
        // ❗ Nadie quedó vivo → empate o todos perdieron
        await db.collection("rooms").updateOne(
          { roomCode },
          { $set: { status: "finished" } }
        );
        io.to(roomCode).emit("gameEnded", { message: "Todos fueron eliminados" });

        for (const userId of questionData.expectedPlayers) {
          const player = room.players.find(p => p.userId === userId);
          if (!questionData.answers.hasOwnProperty(userId) && player?.status === "alive") {
            await updateStats({
              userId: player.userId,
              username: player.name,
              correct: false,
              category: questionData.category
            });
          }
        }

      }
      delete activeQuestions[roomCode]; 
    }, 5000);
  }
  }, 1000);
});

// Responder pregunta
socket.on("answerQuestion", async ({ roomCode, answer, userId, name }) => {

console.log(`[🧠 answerQuestion] roomCode: ${roomCode}, userId: ${userId}, answer: ${answer}`);
console.log(`[📦 questionData]`, JSON.stringify(activeQuestions[roomCode], null, 2));
  const client = await getClient();
      const db = client.db("trivia");

      const room = await db.collection("rooms").findOne({ roomCode });
      if (!room) return;

      const questionData = activeQuestions[roomCode];
      if (!questionData || questionData.answers[userId] !== undefined) return;

      const isCorrect = (answer === questionData.correct);
      questionData.answers[userId] = isCorrect;

      if (!isCorrect) {
        await db.collection("rooms").updateOne(
          { roomCode, "players.userId": userId },
          { $set: { "players.$.status": "eliminated" } }
        );
        io.to(socket.id).emit("roundResult", { status: "eliminated" });
        await updateStats({ userId, username: name, correct: false });
      } else {
        io.to(socket.id).emit("roundResult", { status: "correct" });
        await updateStats({ userId, username: name, correct: true, category: questionData.category });
      }
      // Verificar cuántos jugadores siguen vivos

      const updatedRoom = await db.collection("rooms").findOne({ roomCode });
      const alivePlayers = updatedRoom.players.filter(p => p.status === "alive");      

      if (alivePlayers.length === 1) {
        const winner = alivePlayers[0];
        await db.collection("rooms").updateOne(
          { roomCode },
          { $set: { winner: winner.userId, status: "finished" } }
        );
        io.to(roomCode).emit("gameWinner", winner);
        await updateStats({ userId: winner.userId, username: winner.name, won: true });
        delete activeQuestions[roomCode];
      } else {
        const allAnswered = questionData.expectedPlayers.every(
          id => questionData.answers[id] !== undefined
        );
        console.log("[🔁 Check] All answered?", allAnswered);
        console.log("[✅ Answers]", questionData.answers);
        console.log("[🧑‍🤝‍🧑 Expected]", questionData.expectedPlayers);

        if (allAnswered) {
          console.log("✅ Todos respondieron. Preparando nueva ronda...");
          setTimeout(() => {
            const categories = ["Ciencia", "Arte", "Historia", "Geografía", "Deportes", "Tecnología"];
            const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
            io.to(roomCode).emit("startRoulette", selectedCategory);
            console.log("🌀 Emitiendo nueva ruleta con categoría:", selectedCategory);
            delete activeQuestions[roomCode];
          }, 2000);
        }
      }
});



    // Desconexión
    socket.on("disconnect", async () => {
      console.log("❌ Usuario desconectado:", socket.id);
      // Si quieres, aquí puedes limpiar jugadores por socket.id
    });
  });
};
