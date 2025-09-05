const express = require("express");
const { getQuestions } = require("../controllers/questionsController");

const router = express.Router();

router.get("/", getQuestions);

module.exports = router;
