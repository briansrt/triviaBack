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

async function getOverview(req, res) {
  try {
    const client = await getClient();
    const db = client.db("trivia");
    const statsCollection = db.collection("userStats");

    // 📌 1. Total de partidas jugadas (suma de todos los gamesPlayed)
    const totalStats = await statsCollection.aggregate([
      {
        $group: {
          _id: null,
          totalGames: { $sum: "$gamesPlayed" },
          totalCorrect: { $sum: "$correctAnswers" },
          totalWrong: { $sum: "$wrongAnswers" },
        }
      }
    ]).toArray();

    const totals = totalStats[0] || {
      totalGames: 0,
      totalCorrect: 0,
      totalWrong: 0
    };

    // 📌 2. Ranking de ganadores (Top 5 por gamesWon)
    const topWinners = await statsCollection.find(
      { gamesWon: { $gt: 0 } }
    )
    .sort({ gamesWon: -1 })
    .limit(5)
    .project({ _id: 0, userId: 1, username: 1, gamesWon: 1 })
    .toArray();

    // 📌 3. Categorías más acertadas globalmente
    const categoryStats = await statsCollection.aggregate([
      {
        $project: {
          categories: { $objectToArray: "$categories" }
        }
      },
      { $unwind: "$categories" },
      {
        $group: {
          _id: "$categories.k",
          totalCorrect: { $sum: "$categories.v" }
        }
      },
      { $sort: { totalCorrect: -1 } },
      { $limit: 5 }
    ]).toArray();

    res.json({
      totals,
      topWinners,
      topCategories: categoryStats.map(c => ({
        category: c._id,
        correctAnswers: c.totalCorrect
      }))
    });

    
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las estadísticas globales" });
  }
}

module.exports = { getQuestions, getOverview };
