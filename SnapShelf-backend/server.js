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
// Use Gemini 2.0 Flash model
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const SUPPORTED_CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'drinks',
  'leftovers',
  'condiments',
  'frozen',
  'bakery',
  'snacks',
  'beverages',
  'seafood',
  'poultry',
  'grains',
  'spices',
  'other'
]);

const GPT_VISION_PROMPT = `You are an AI that analyzes a photo of the inside of a refrigerator.

Detect ALL food items visible in the image. For EACH item, estimate:

- "name": the item's common name
- "qty": rough quantity (integer estimate)
- "expiresInDays": approximate days until expiration (integer)
- "category": one of ["produce", "dairy", "meat", "drinks", "leftovers", "condiments", "frozen", "bakery", "snacks", "beverages", "seafood", "poultry", "grains", "spices", "other"]

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
app.use(express.json({ limit: '50mb' })); // Increase limit for large base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
      maxOutputTokens: 2048 // Increased to handle longer responses
    }
  };

  console.log(`Calling Gemini API with model: ${GEMINI_MODEL}`);
  console.log('Image size (base64 length):', base64Image.length);
  console.log('MIME type:', mimeType);
  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 90000 // 90 seconds timeout
      }
    );

    const elapsedTime = Date.now() - startTime;
    console.log(`Gemini API responded in ${elapsedTime}ms`);
    console.log('Full Gemini response:', JSON.stringify(response.data, null, 2));

    // Check for safety ratings that might block content
    const candidates = response.data?.candidates || [];
    if (!candidates.length) {
      // Check if there's a promptFeedback with blocked reasons
      const promptFeedback = response.data?.promptFeedback;
      if (promptFeedback?.blockReason) {
        console.error('Gemini blocked the request:', promptFeedback);
        throw new Error(`Gemini blocked the request: ${promptFeedback.blockReason}. ${promptFeedback.blockReasonMessage || ''}`);
      }
      console.error('Gemini returned no candidates', JSON.stringify(response.data, null, 2));
      throw new Error('Gemini returned no candidates. Check the response structure.');
    }

    const candidate = candidates[0];
    
    // Check for finish reason (safety filters, etc.)
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      console.error('Gemini finished with reason:', candidate.finishReason);
      if (candidate.finishReason === 'SAFETY') {
        const safetyRatings = candidate.safetyRatings || [];
        console.error('Safety ratings:', safetyRatings);
        throw new Error(`Content was blocked by safety filters. Safety ratings: ${JSON.stringify(safetyRatings)}`);
      }
      if (candidate.finishReason === 'MAX_TOKENS') {
        // Response was cut off, but we might still have partial content
        console.warn('Response was truncated due to MAX_TOKENS, attempting to parse partial response');
        // Continue to try parsing what we have
      } else {
        throw new Error(`Gemini finished with reason: ${candidate.finishReason}`);
      }
    }

    const parts = candidate?.content?.parts || [];
    console.log('Content parts:', JSON.stringify(parts, null, 2));
    
    // Try to extract text from parts
    let messageContent = parts
      .map((part) => part?.text ?? '')
      .join('')
      .trim();

    // Fallback: check if text is directly in content
    if (!messageContent && candidate?.content?.text) {
      messageContent = candidate.content.text.trim();
      console.log('Found text directly in content');
    }

    // Fallback: check if text is directly in candidate
    if (!messageContent && candidate?.text) {
      messageContent = candidate.text.trim();
      console.log('Found text directly in candidate');
    }

    if (!messageContent) {
      console.error('Gemini returned empty content parts. Full candidate:', JSON.stringify(candidate, null, 2));
      console.error('Full response data:', JSON.stringify(response.data, null, 2));
      throw new Error('Gemini returned empty content. The response may have been blocked or filtered. Check the logs for the full response structure.');
    }

    console.log('Extracted message content length:', messageContent.length);
    console.log('First 500 chars of content:', messageContent.substring(0, 500));

    let parsed;

    try {
      // Try to extract JSON from markdown code blocks if present
      let jsonString = messageContent.trim();
      
      // Remove markdown code blocks (```json ... ``` or ``` ... ```)
      jsonString = jsonString.replace(/^```(?:json)?\s*\n?/i, '');
      jsonString = jsonString.replace(/\n?```\s*$/i, '');
      jsonString = jsonString.trim();
      
      // Try to find JSON object in the string if it's wrapped in text
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
      
      parsed = JSON.parse(jsonString);
    } catch (error) {
      console.error('Failed to parse Gemini response. Raw content:', messageContent);
      console.error('Parse error:', error.message);
      throw new Error(`Unable to parse response from Gemini. The response may not be valid JSON. Error: ${error.message}`);
    }

    if (!parsed || !parsed.items || !Array.isArray(parsed.items)) {
      console.error('Parsed response does not have items array:', parsed);
      throw new Error('Gemini response does not contain a valid items array');
    }

    return parsed.items;
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    if (error.code === 'ECONNABORTED') {
      console.error(`Gemini API request timed out after ${elapsedTime}ms`);
      throw new Error('Request to Gemini API timed out. Please try again.');
    } else if (error.response) {
      console.error('Gemini API error response:', error.response.status, error.response.data);
      throw new Error(`Gemini API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('Gemini API request error - no response received:', error.message);
      throw new Error('No response from Gemini API. Please check your connection.');
    } else {
      console.error('Gemini API error:', error.message);
      throw error;
    }
  }
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

  console.log('Received image upload:', {
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });

  try {
    const mimeType = req.file.mimetype || 'image/jpeg';
    const base64Image = req.file.buffer.toString('base64');
    console.log('Image converted to base64, length:', base64Image.length);
    
    const rawItems = await callGeminiVision(base64Image, mimeType);
    console.log('Received items from Gemini:', rawItems.length);
    
    const normalizedItems = normalizeItems(rawItems);
    console.log('Normalized items:', normalizedItems.length);

    await itemsCollection.deleteMany({});

    const insertedItems = [];
    for (const item of normalizedItems) {
      const { insertedId } = await itemsCollection.insertOne(item);
      insertedItems.push({ ...item, _id: insertedId });
    }

    console.log('Successfully saved items to database');
    res.json({
      status: 'ok',
      items: insertedItems
    });
  } catch (error) {
    console.error('Failed to analyze fridge:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.status(500).json({ 
      error: error.message || 'Failed to analyze fridge image'
    });
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
