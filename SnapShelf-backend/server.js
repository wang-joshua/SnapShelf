const express = require('express');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

const PORT = process.env.PORT || 4000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'snapshelf';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const SUPPORTED_CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'drinks',
  'leftovers',
  'condiments',
  'other'
]);

const GPT_VISION_PROMPT = `You are an AI that analyzes a photo of the inside of a refrigerator.

Detect ALL food items visible in the image. For EACH item, estimate:

- "name": the item's common name
- "qty": rough quantity (integer estimate)
- "expiresInDays": approximate days until expiration (integer)
- "category": one of ["produce", "dairy", "meat", "drinks", "leftovers", "condiments", "other"]

Return ONLY valid JSON and NOTHING else.
Use this EXACT format:

{
  "items": [
    {
      "name": "string",
      "qty": number,
      "expiresInDays": number,
      "category": "string"
    }
  ]
}


Do NOT include explanations. Do NOT add extra text.`;

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const mongoOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
};

let mongoClient;
let itemsCollection;

async function connectToDatabase() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI environment variable is required');
  }

  mongoClient = new MongoClient(MONGO_URI, mongoOptions);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB_NAME);
  itemsCollection = db.collection('items');
  console.log(`Connected to MongoDB database "${MONGO_DB_NAME}"`);
}

async function callGeminiVision(base64Image, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: GPT_VISION_PROMPT },
          { inlineData: { mimeType, data: base64Image } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800
    }
  };

  const response = await axios.post(
    `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  const candidates = response.data?.candidates || [];
  if (!candidates.length) {
    console.error('Gemini returned no candidates', response.data);
    throw new Error('Gemini returned an empty response');
  }

  const parts = candidates?.[0]?.content?.parts || [];
  const messageContent = parts
    .map((part) => part?.text ?? '')
    .join('')
    .trim();

  if (!messageContent) {
    console.error('Gemini returned empty content parts', response.data);
    throw new Error('Gemini returned an empty response');
  }

  let parsed;

  try {
    parsed = JSON.parse(messageContent);
  } catch (error) {
    console.error('Failed to parse OpenAI response:', messageContent);
    throw new Error('Unable to parse response from OpenAI');
  }

  return parsed.items || [];
}

function normalizeItems(items = []) {
  const safeInteger = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.round(num));
  };

  return items
    .map((item) => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) {
        return null;
      }

      const qty = safeInteger(item.qty);
      const expiresInDays = safeInteger(item.expiresInDays);
      const rawCategory = typeof item.category === 'string' ? item.category.toLowerCase() : '';
      const category = SUPPORTED_CATEGORIES.has(rawCategory) ? rawCategory : 'other';

      return {
        name,
        qty,
        expiresInDays,
        category,
        detectedAt: new Date()
      };
    })
    .filter(Boolean);
}

app.get('/', (_req, res) => {
  res.json({ status: 'SnapShelf API is running' });
});

app.get('/fridge-items', async (_req, res) => {
  try {
    if (!itemsCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const items = await itemsCollection.find({}).sort({ detectedAt: -1 }).toArray();
    res.json(items);
  } catch (error) {
    console.error('Failed to fetch fridge items:', error.message);
    res.status(500).json({ error: 'Unable to fetch fridge items' });
  }
});

app.post('/analyze-fridge', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }

  if (!itemsCollection) {
    return res.status(503).json({ error: 'Database connection not ready' });
  }

  try {
    const mimeType = req.file.mimetype || 'image/jpeg';
    const base64Image = req.file.buffer.toString('base64');
    const rawItems = await callGeminiVision(base64Image, mimeType);
    const normalizedItems = normalizeItems(rawItems);

    await itemsCollection.deleteMany({});

    const insertedItems = [];
    for (const item of normalizedItems) {
      const { insertedId } = await itemsCollection.insertOne(item);
      insertedItems.push({ ...item, _id: insertedId });
    }

    res.json({
      status: 'ok',
      items: insertedItems
    });
  } catch (error) {
    console.error('Failed to analyze fridge:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to analyze fridge image' });
  }
});

async function startServer() {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      console.log(`SnapShelf backend listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

const gracefulShutdown = async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = app;
