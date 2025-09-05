const express = require("express");
const { createRoom, joinRoom, updateRoomStatus, setWinner } = require("../controllers/roomsController");

const router = express.Router();

router.post("/create", createRoom);
router.post("/join", joinRoom);
router.post("/status", updateRoomStatus);
router.post("/winner", setWinner);

module.exports = router;
