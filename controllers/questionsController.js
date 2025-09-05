const getClient = require("../db/mongo");

// GET todas las preguntas
async function getQuestions(req, res) {
  try {
    const client = await getClient();
    const db = client.db("trivia");
    const questions = await db.collection("preguntas").find().toArray();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: "Error obteniendo preguntas" });
  }
}

module.exports = { getQuestions };
