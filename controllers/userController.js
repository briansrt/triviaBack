const getClient = require("../db/mongo");

const register = async (req, res) => {
    const client = await getClient();
    const { type, data } = req.body;

    const getName = (data) => {
        // Usa primero los nombres si existen
        const firstName = data.first_name;
        const lastName = data.last_name;

        // Fallback: intenta usar el campo "name" si no hay nombres separados
        if (!firstName && !lastName && data.username) {
            const splitName = data.username.split(' ');
            return {
            firstName: splitName[0],
            lastName: splitName.slice(1).join(' ') || '',
            };
        }

        // Fallback más general
        return {
            firstName: firstName || '',
            lastName: lastName || '',
        };
    };



    if (type === 'user.created') {
        const { id, email_addresses } = data;
        const { firstName, lastName } = getName(data);
        try {
            await client.db('trivia').collection('users').insertOne({ email: email_addresses[0]?.email_address || '', firstName, lastName, clerkId: id });
            res.status(201).json({ message: `Usuario creado exitosamente` });
        } catch (error) {
            console.error('Error al crear el usuario:', error);
            res.status(500).json({ message: 'Error al crear el usuario' });
        }
    }
  }

async function updateStats({ userId, username, correct, category, won }) {
  const client = await getClient();
  const db = client.db("trivia");

  const inc = {
    gamesPlayed: won !== undefined ? 1 : 0,
    gamesWon: won ? 1 : 0,
    correctAnswers: correct ? 1 : 0,
    wrongAnswers: correct === false ? 1 : 0,
  };

  // Contar categoría más frecuente → lo haremos con un array de categorías acertadas
  const update = {
    $set: { username, lastPlayed: new Date() },
    $inc: inc,
  };

  if (correct && category) {
    update.$push = { categories: category };
  }

  await db.collection("userStats").updateOne(
    { userId },
    update,
    { upsert: true }
  );
}

async function getRanking(req, res) {
  try {
    const client = await getClient();
    const db = client.db("trivia");

    const ranking = await db.collection("userStats")
      .find({})
      .sort({ gamesWon: -1, correctAnswers: -1 })
      .limit(10)
      .toArray();

    res.json(ranking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo ranking" });
  }
}

module.exports = { register, updateStats, getRanking };