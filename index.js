const express = require('express');
const {urlencoded, json} = require('express');
const http = require("http");
const { Server } = require("socket.io");
const cors = require('cors');
const getClient = require("./db/mongo");
const initSockets = require("./socket");
const userRoutes = require("./routes/user.routes");
const questionRoutes = require("./routes/questions.routes");
const roomRoutes = require("./routes/room.routes");
const port = process.env.PORT;

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*", // usa variable de entorno
    methods: ["GET", "POST"],
  }
});

app.use(urlencoded({extended: true}))
app.use(json())
app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});
app.use(cors())
app.use("/trivia/user", userRoutes);
app.use("/trivia/questions", questionRoutes);
app.use("/trivia/rooms", roomRoutes);
// app.use("/trivia/users", userRoutes);

initSockets(io);

(async () => {
  try {
    await getClient(); // 👈 garantizamos conexión antes de levantar server
    server.listen(port, () =>
      console.log(`🚀 Servidor corriendo en http://localhost:${port}`)
    );
  } catch (error) {
    console.error("❌ No se pudo conectar a MongoDB:", error);
    process.exit(1);
  }
})();