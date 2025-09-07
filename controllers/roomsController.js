const getClient = require("../db/mongo");

// Crear sala
async function createRoom(req, res) {
  try {
    const client = await getClient();
    const db = client.db("trivia");

    const room = {
      roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      players: [],
      status: "waiting",
      maxPlayers: 5,
      winner: null,
      createdAt: new Date()
    };

    const result = await db.collection("rooms").insertOne(room);
    res.json({
      message: "Sala creada",
      roomId: result.insertedId,
      roomCode: room.roomCode
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando sala" });
  }
}

// Unirse a sala
async function joinRoom(req, res) {
  try {
    const { roomCode, userId, username } = req.body;

    const client = await getClient();
    const db = client.db("trivia"); // 🔥 unificado

    const room = await db.collection("rooms").findOne({ roomCode });

    if (!room) {
      return res.status(404).json({ error: "Sala no encontrada" });
    }

    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ error: "La sala está llena" });
    }

    if (room.players.find(p => p.userId === userId)) {
      return res.status(400).json({ error: "El jugador ya está en la sala" });
    }

    const newPlayer = { userId, username, status: "alive", joinedAt: new Date() };

    await db.collection("rooms").updateOne(
      { roomCode },
      { $push: { players: newPlayer } }
    );

    res.json({ message: "Jugador unido a la sala", roomCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error uniendo a sala" });
  }
}

// Cambiar estado de sala
async function updateRoomStatus(req, res) {
  try {
    const { roomCode, status } = req.body;

    const client = await getClient();
    const db = client.db("trivia");

    await db.collection("rooms").updateOne(
      { roomCode },
      { $set: { status } }
    );

    res.json({ message: `Estado actualizado a ${status}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error actualizando estado de sala" });
  }
}

// Registrar ganador
async function setWinner(req, res) {
  try {
    const { roomCode, winnerId } = req.body;

    const client = await getClient();
    const db = client.db("trivia");

    await db.collection("rooms").updateOne(
      { roomCode },
      { $set: { winner: winnerId, status: "finished" } }
    );

    res.json({ message: "Ganador registrado", winnerId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error registrando ganador" });
  }
}

async function active(req, res) {
  try {
    const client = await getClient();
    const db = client.db("trivia");

    const activeRooms = await db.collection("rooms").find({ status: "playing" }).project({ _id: 0 }).toArray();
    res.json(activeRooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo salas activas" });
  }
}

module.exports = { createRoom, joinRoom, updateRoomStatus, setWinner, active };
