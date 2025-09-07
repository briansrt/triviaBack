const express = require("express");
const { getQuestions, getOverview } = require("../controllers/questionsController");

const router = express.Router();

router.get("/", getQuestions);
router.get("/overview", getOverview);

module.exports = router;
