const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;
const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "anime_music";
const client = new MongoClient(MONGO_URL);

async function connectDB() {
  await client.connect();
  console.log("MongoDB connected");
  return client.db(DB_NAME);
}

async function ensureSeedData(db) {
  const songsCol = db.collection("songs");
  const count = await songsCol.countDocuments();
  if (count > 0) return;

  const sampleSongs = [
    { title: "Moonlit Drift", artist: "Aoi", genre: "lofi", mood: ["calm", "dreamy"], tags: ["night", "study"], popularity: 92 },
    { title: "Cherry Storm", artist: "Sora", genre: "pop", mood: ["happy", "energetic"], tags: ["sunset", "dance"], popularity: 88 },
    { title: "Neon Rain", artist: "Kiro", genre: "electronic", mood: ["upbeat", "focus"], tags: ["city", "night"], popularity: 95 },
    { title: "Skyline Echo", artist: "Mika", genre: "indie", mood: ["warm", "nostalgic"], tags: ["travel", "sunrise"], popularity: 84 },
    { title: "Midnight Sakura", artist: "Hana", genre: "ambient", mood: ["calm", "sad"], tags: ["rain", "late"], popularity: 80 },
    { title: "Solar Pulse", artist: "Ren", genre: "rock", mood: ["powerful", "energetic"], tags: ["training", "motivation"], popularity: 90 },
    { title: "Glass Horizon", artist: "Yui", genre: "jazz", mood: ["chill", "happy"], tags: ["coffee", "soft"], popularity: 79 },
    { title: "Crescent Ride", artist: "Aki", genre: "electronic", mood: ["upbeat", "focus"], tags: ["driving", "night"], popularity: 91 },
    { title: "Bloom in Blue", artist: "Nami", genre: "pop", mood: ["happy", "dreamy"], tags: ["summer", "soft"], popularity: 87 },
    { title: "Starlit Arcade", artist: "Zero", genre: "synthwave", mood: ["nostalgic", "upbeat"], tags: ["retro", "anime"], popularity: 93 }
  ];

  await songsCol.insertMany(sampleSongs);
  console.log("Seeded sample songs");
}

async function getRecommendations(db, userId) {
  const listens = db.collection("listens");
  const songs = db.collection("songs");

  const liked = await listens.find({ userId: new ObjectId(userId), liked: true }).toArray();
  if (liked.length === 0) {
    return songs.find({}).sort({ popularity: -1 }).limit(6).toArray();
  }

  const likedGenres = [];
  const likedMoods = [];
  const tags = [];
  const artists = [];

  for (const item of liked) {
    const song = await songs.findOne({ _id: item.songId });
    if (!song) continue;
    likedGenres.push(song.genre);
    likedMoods.push(...(song.mood || []));
    tags.push(...(song.tags || []));
    artists.push(song.artist);
  }

  const recs = await songs.aggregate([
    { $match: { _id: { $nin: liked.map((x) => x.songId) } } },
    {
      $addFields: {
        score: {
          $add: [
            { $cond: [{ $in: ["$genre", likedGenres] }, 4, 0] },
            { $sum: [{ $map: { input: "$mood", as: "m", in: { $cond: [{ $in: ["$$m", likedMoods] }, 2, 0] } } }] },
            { $sum: [{ $map: { input: "$tags", as: "t", in: { $cond: [{ $in: ["$$t", tags] }, 2, 0] } } }] },
            { $cond: [{ $in: ["$artist", artists] }, 3, 0] },
            { $divide: ["$popularity", 20] }
          ]
        }
      }
    },
    { $sort: { score: -1, popularity: -1 } },
    { $limit: 6 }
  ]).toArray();

  return recs;
}

app.get("/api/songs", async (req, res) => {
  try {
    const db = client.db(DB_NAME);
    const songs = await db.collection("songs").find({}).sort({ popularity: -1 }).toArray();
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/recommendations/:userId", async (req, res) => {
  try {
    const db = client.db(DB_NAME);
    const userId = req.params.userId;
    const recs = await getRecommendations(db, userId);
    res.json(recs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/like", async (req, res) => {
  try {
    const db = client.db(DB_NAME);
    const { userId, songId } = req.body;
    const id = new ObjectId(songId);
    const userObjId = new ObjectId(userId);

    await db.collection("listens").updateOne(
      { userId: userObjId, songId: id },
      { $set: { liked: true, listenedAt: new Date() } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  const db = await connectDB();
  await ensureSeedData(db);

  app.listen(PORT, () => {
    console.log(`App running on http://localhost:${PORT}`);
  });
})().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
