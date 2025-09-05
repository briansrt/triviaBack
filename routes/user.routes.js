const express = require("express");
const { register, getRanking } = require("../controllers/userController");

const router = express.Router();

router.post("/", register);
router.get("/ranking", getRanking);

module.exports = router;
