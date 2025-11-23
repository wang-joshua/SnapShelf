const express = require('express');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const sharp = require('sharp');

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
  'chips'
]);

const GPT_VISION_PROMPT = `You are an AI that analyzes a photo of the inside of a refrigerator.

Detect ALL food items visible in the image. For EACH item, estimate:

- "name": the item's common name
- "qty": rough quantity (integer estimate)
- "expiresInDays": approximate days until expiration (integer)
- "category": one of ["produce", "dairy", "meat", "drinks", "leftovers", "condiments", "frozen", "bakery", "snacks", "beverages", "seafood", "poultry", "grains", "spices", "chips"]
- "bbox": bounding box coordinates as [x, y, width, height] where x,y is top-left corner, values are 0-1 (normalized to image size)

Return ONLY valid JSON and NOTHING else.
Use this EXACT format:

{
  "items": [
    {
      "name": "string",
      "qty": number,
      "expiresInDays": number,
      "category": "string",
      "bbox": [x, y, width, height]
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
let groceryListCollection;
let recipesCollection;

async function connectToDatabase() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI environment variable is required');
  }

  mongoClient = new MongoClient(MONGO_URI, mongoOptions);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB_NAME);
  itemsCollection = db.collection('items');
  groceryListCollection = db.collection('groceryList');
  recipesCollection = db.collection('recipes');
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

async function callGeminiForRecipes(fridgeItems = []) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const fridgeSummary = fridgeItems
    .map((item) => {
      const name = typeof item.name === 'string' ? item.name : '';
      const qty = Number.isFinite(item.qty) ? item.qty : 0;
      if (!name) return null;
      return `${name} (qty ${qty})`;
    })
    .filter(Boolean)
    .join(', ');

  const prompt = `You are a creative chef. Based on the current fridge inventory, create 4-6 approachable recipes.
Fridge items: ${fridgeSummary || 'none'}

Return ONLY valid JSON, nothing else, using this format:
[
  {
    "title": "Recipe name",
    "description": "Short paragraph about the dish.",
    "instructions": "Step-by-step instructions.",
    "category": "breakfast | lunch | dinner | snack | dessert | drink",
    "imgUrl": "https://example.com/image.jpg",
    "ingredients": [
      { "name": "ingredient name", "qty": 1 }
    ]
  }
]

Rules:
- description must be a short paragraph.
- imgUrl must be a URL (no base64, no data URI).
- Ingredients must be an array with name (string) and qty (number).`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 2048
    }
  };

  const response = await axios.post(
    `${GEMINI_URL}?key=${GEMINI_API_KEY}`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }
  );

  const parts = response.data?.candidates?.[0]?.content?.parts || [];
  let messageContent = parts.map((part) => part?.text ?? '').join('').trim();
  if (!messageContent && response.data?.candidates?.[0]?.content?.text) {
    messageContent = response.data.candidates[0].content.text.trim();
  }
  if (!messageContent) {
    throw new Error('Gemini returned empty recipe content');
  }

  let parsed;
  try {
    let jsonString = messageContent.trim();
    jsonString = jsonString.replace(/^```(?:json)?\s*\n?/i, '');
    jsonString = jsonString.replace(/\n?```\s*$/i, '');
    const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    parsed = JSON.parse(jsonString);
  } catch (err) {
    console.error('Failed to parse Gemini recipe response:', messageContent);
    throw new Error('Unable to parse recipe response from Gemini');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Recipe response is not an array');
  }

  return parsed;
}

async function cropItemImage(imageBuffer, bbox, imageWidth, imageHeight) {
  try {
    // bbox is [x, y, width, height] normalized 0-1
    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return null;
    }

    const [xNorm, yNorm, widthNorm, heightNorm] = bbox;
    
    // Convert normalized coordinates to pixels
    const x = Math.max(0, Math.floor(xNorm * imageWidth));
    const y = Math.max(0, Math.floor(yNorm * imageHeight));
    const width = Math.min(imageWidth - x, Math.floor(widthNorm * imageWidth));
    const height = Math.min(imageHeight - y, Math.floor(heightNorm * imageHeight));

    // Add padding (10% on each side)
    const paddingX = Math.floor(width * 0.1);
    const paddingY = Math.floor(height * 0.1);
    
    const left = Math.max(0, x - paddingX);
    const top = Math.max(0, y - paddingY);
    const right = Math.min(imageWidth, x + width + paddingX);
    const bottom = Math.min(imageHeight, y + height + paddingY);
    
    const cropWidth = right - left;
    const cropHeight = bottom - top;

    if (cropWidth <= 0 || cropHeight <= 0) {
      return null;
    }

    // Crop the image
    const croppedBuffer = await sharp(imageBuffer)
      .extract({
        left,
        top,
        width: cropWidth,
        height: cropHeight
      })
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();

    return croppedBuffer;
  } catch (error) {
    console.error('Error cropping image:', error);
    return null;
  }
}

function canonicalizeName(name = '') {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const alnum = cleaned.replace(/[^a-z0-9\s]/g, '');
  if (!alnum) return '';

  // Simple singularization to reduce duplicate variants
  if (alnum.endsWith('ies') && alnum.length > 3) {
    return `${alnum.slice(0, -3)}y`;
  }
  if (alnum.endsWith('es') && alnum.length > 2) {
    return alnum.slice(0, -2);
  }
  if (alnum.endsWith('s') && alnum.length > 1) {
    return alnum.slice(0, -1);
  }
  return alnum;
}

function toTitleCase(str = '') {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function generateNameVariants(baseName = '') {
  if (!baseName) return [];
  const variants = new Set([baseName]);
  if (baseName.endsWith('y')) {
    variants.add(`${baseName.slice(0, -1)}ies`);
  }
  variants.add(`${baseName}s`);
  variants.add(`${baseName}es`);
  return Array.from(variants);
}

function normalizeItems(items = []) {
  const capitalizeWords = (str = '') =>
    str
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const safeInteger = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.round(num));
  };

  return items
    .map((item) => {
      const rawName = typeof item.name === 'string' ? item.name.trim() : '';
      const canonicalName = canonicalizeName(rawName);
      const displayName = capitalizeWords(rawName);
      if (!rawName || !canonicalName) {
        return null;
      }

      const qty = safeInteger(item.qty);
      const expiresInDays = safeInteger(item.expiresInDays);
      const rawCategory = typeof item.category === 'string' ? item.category.toLowerCase() : '';
      const category = SUPPORTED_CATEGORIES.has(rawCategory) ? rawCategory : 'snacks';

      // Validate bbox if present
      let bbox = null;
      if (item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4) {
        const [x, y, w, h] = item.bbox;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && w > 0 && w <= 1 && h > 0 && h <= 1) {
          bbox = [x, y, w, h];
        }
      }

      return {
        name: displayName,
        canonicalName,
        qty,
        expiresInDays,
        category,
        bbox,
        detectedAt: new Date()
      };
    })
    .filter(Boolean);
}

function sanitizeRecipe(doc = {}) {
  const description = typeof doc.description === 'string' ? doc.description : '';
  const imgUrl = typeof doc.imgUrl === 'string' ? doc.imgUrl : '';
  const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : 'Untitled Recipe';
  const category = typeof doc.category === 'string' ? doc.category : '';
  const instructions = typeof doc.instructions === 'string' ? doc.instructions : '';
  const ingredients = Array.isArray(doc.ingredients)
    ? doc.ingredients.map((ing) => ({
        name: typeof ing?.name === 'string' ? ing.name : '',
        qty: Number.isFinite(ing?.qty) ? ing.qty : 0
      }))
    : [];

  return {
    ...doc,
    title,
    category,
    description,
    instructions,
    imgUrl,
    ingredients
  };
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
    const capitalizeWords = (str = '') =>
      str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    const formatted = items.map((item) => ({
      ...item,
      name: capitalizeWords(item.name || '')
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Failed to fetch fridge items:', error.message);
    res.status(500).json({ error: 'Unable to fetch fridge items' });
  }
});

// Grocery list routes
app.post('/grocery/add-item', async (req, res) => {
  try {
    if (!groceryListCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const { name, qtyNeeded, category } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const displayName = toTitleCase(trimmedName);
    const qtyValue = Number(qtyNeeded);

    if (!trimmedName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      return res.status(400).json({ error: 'qtyNeeded must be a positive number' });
    }
    if (category !== undefined && typeof category !== 'string') {
      return res.status(400).json({ error: 'category must be a string' });
    }

    const doc = {
      name: displayName,
      qtyNeeded: Math.round(qtyValue),
      category: (category && category.trim()) || 'other',
      createdAt: new Date()
    };

    await groceryListCollection.insertOne(doc);
    const list = await groceryListCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(list);
  } catch (error) {
    console.error('Failed to add grocery item:', error.message);
    res.status(500).json({ error: error.message || 'Failed to add grocery item' });
  }
});

app.get('/grocery/list', async (_req, res) => {
  try {
    if (!groceryListCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }
    const list = await groceryListCollection.find({}).sort({ createdAt: -1 }).toArray();
    const formatted = list.map((item) => ({
      ...item,
      name: toTitleCase(item.name || '')
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Failed to fetch grocery list:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch grocery list' });
  }
});

app.delete('/grocery/item/:id', async (req, res) => {
  try {
    if (!groceryListCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    await groceryListCollection.deleteOne({ _id: new ObjectId(id) });
    const list = await groceryListCollection.find({}).sort({ createdAt: -1 }).toArray();
    const formatted = list.map((item) => ({
      ...item,
      name: toTitleCase(item.name || '')
    }));
    res.json({ status: 'ok', list: formatted });
  } catch (error) {
    console.error('Failed to delete grocery item:', error.message);
    res.status(500).json({ error: error.message || 'Failed to delete grocery item' });
  }
});

app.get('/grocery/compare', async (_req, res) => {
  try {
    if (!itemsCollection || !groceryListCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const [fridgeItems, groceryItems] = await Promise.all([
      itemsCollection.find({}).toArray(),
      groceryListCollection.find({}).toArray()
    ]);

    const fridgeMap = fridgeItems.reduce((map, item) => {
      const normalized = typeof item.name === 'string' ? item.name.toLowerCase().trim() : '';
      if (!normalized) return map;
      const qty = Number.isFinite(item.qty) ? item.qty : 0;
      map[normalized] = (map[normalized] || 0) + qty;
      return map;
    }, {});

    const result = {
      fullySatisfied: [],
      partiallySatisfied: [],
      missing: []
    };

    groceryItems.forEach((grocery) => {
      const normalized = typeof grocery.name === 'string' ? grocery.name.toLowerCase().trim() : '';
      if (!normalized) return;
      const needed = Number.isFinite(grocery.qtyNeeded) ? grocery.qtyNeeded : 0;
      const inFridge = fridgeMap[normalized] || 0;

      const payload = {
        name: toTitleCase(grocery.name || ''),
        qtyNeeded: needed,
        qtyInFridge: inFridge
      };

      if (inFridge >= needed && needed > 0) {
        result.fullySatisfied.push(payload);
      } else if (inFridge > 0 && inFridge < needed) {
        result.partiallySatisfied.push(payload);
      } else {
        result.missing.push(payload);
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Failed to compare grocery list:', error.message);
    res.status(500).json({ error: error.message || 'Failed to compare grocery list' });
  }
});

// Recipe routes
app.get('/recipes/all', async (_req, res) => {
  try {
    if (!recipesCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }
    const recipes = await recipesCollection.find({}).sort({ createdAt: -1 }).toArray();
    const sanitized = recipes.map((r) => sanitizeRecipe(r));
    res.json(sanitized);
  } catch (error) {
    console.error('Failed to fetch recipes:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch recipes' });
  }
});

app.get('/recipes/recommend', async (_req, res) => {
  try {
    if (!recipesCollection || !itemsCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const [recipes, fridgeItems] = await Promise.all([
      recipesCollection.find({}).toArray(),
      itemsCollection.find({}).toArray()
    ]);

    const normalize = (str = '') => str.toLowerCase().trim();

    const fridgeMap = fridgeItems.reduce((map, item) => {
      const key = normalize(typeof item.name === 'string' ? item.name : '');
      if (!key) return map;
      const qty = Number.isFinite(item.qty) ? item.qty : 0;
      map[key] = (map[key] || 0) + qty;
      return map;
    }, {});

    const fullyMakeable = [];
    const almostMakeable = [];

    recipes.forEach((recipe) => {
      const safeRecipe = sanitizeRecipe(recipe);
      const missingIngredients = [];
      const availableIngredients = [];

      (safeRecipe.ingredients || []).forEach((ing) => {
        const ingNameRaw = typeof ing.name === 'string' ? ing.name : '';
        const ingName = normalize(ingNameRaw);
        if (!ingName) return;
        if (fridgeMap[ingName] !== undefined) {
          availableIngredients.push(ingNameRaw);
        } else {
          const qtyNeeded = Number.isFinite(ing.qty) ? ing.qty : 1;
          missingIngredients.push({ name: ingNameRaw, qtyNeeded });
        }
      });

      const basePayload = {
        title: safeRecipe.title,
        recipeId: safeRecipe._id,
        missingIngredients,
        availableIngredients,
        description: safeRecipe.description,
        imgUrl: safeRecipe.imgUrl,
        category: safeRecipe.category,
        ingredients: safeRecipe.ingredients
      };

      if (missingIngredients.length === 0) {
        fullyMakeable.push(basePayload);
      } else if (missingIngredients.length <= 2) {
        almostMakeable.push(basePayload);
      }
    });

    res.json({ fullyMakeable, almostMakeable });
  } catch (error) {
    console.error('Failed to recommend recipes:', error.message);
    res.status(500).json({ error: error.message || 'Failed to recommend recipes' });
  }
});

app.post('/recipes/add-missing-to-grocery', async (req, res) => {
  try {
    if (!groceryListCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const { recipeId, missingIngredients } = req.body || {};
    if (!recipeId) {
      return res.status(400).json({ error: 'recipeId is required' });
    }
    if (!Array.isArray(missingIngredients)) {
      return res.status(400).json({ error: 'missingIngredients must be an array' });
    }

    const inserts = [];
    for (const item of missingIngredients) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const qtyNeeded = Number(item?.qtyNeeded);
      if (!name || !Number.isFinite(qtyNeeded) || qtyNeeded <= 0) {
        continue;
      }

      inserts.push({
        name: toTitleCase(name),
        qtyNeeded: Math.round(qtyNeeded),
        category: (item.category && typeof item.category === 'string' && item.category.trim()) || 'other',
        createdAt: new Date()
      });
    }

    if (inserts.length) {
      await groceryListCollection.insertMany(inserts);
    }

    res.json({ status: 'ok', inserted: inserts.length });
  } catch (error) {
    console.error('Failed to add missing ingredients to grocery:', error.message);
    res.status(500).json({ error: error.message || 'Failed to add missing ingredients to grocery' });
  }
});

app.post('/recipes/generate', async (_req, res) => {
  try {
    if (!recipesCollection || !itemsCollection) {
      return res.status(503).json({ error: 'Database connection not ready' });
    }

    const fridgeItems = await itemsCollection.find({}).toArray();
    const generated = await callGeminiForRecipes(fridgeItems);

    const now = new Date();
    for (const recipe of generated) {
      const sanitized = sanitizeRecipe({ ...recipe, createdAt: now });
      const { createdAt, ...rest } = sanitized;
      await recipesCollection.updateOne(
        { title: sanitized.title },
        { $set: rest, $setOnInsert: { createdAt: createdAt || now } },
        { upsert: true }
      );
    }

    const recipes = await recipesCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(recipes.map((r) => sanitizeRecipe(r)));
  } catch (error) {
    console.error('Failed to generate recipes:', error.message);
    res.status(500).json({ error: error.message || 'Failed to generate recipes' });
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
    const imageBuffer = req.file.buffer;
    const base64Image = imageBuffer.toString('base64');
    console.log('Image converted to base64, length:', base64Image.length);
    
    // Get image dimensions for cropping
    const imageMetadata = await sharp(imageBuffer).metadata();
    const imageWidth = imageMetadata.width || 1000;
    const imageHeight = imageMetadata.height || 1000;
    console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);
    
    const rawItems = await callGeminiVision(base64Image, mimeType);
    console.log('Received items from Gemini:', rawItems.length);
    
    const normalizedItems = normalizeItems(rawItems);
    console.log('Normalized items:', normalizedItems.length);

    // Upsert items: update quantity (and other fields) if item already exists, otherwise insert
    const updatedItems = [];
    for (const item of normalizedItems) {
      let itemImageData = null;
      let itemImageMimeType = mimeType;

      // Try to crop the item image if bbox is available
      if (item.bbox) {
        console.log(`Cropping image for ${item.name} with bbox:`, item.bbox);
        const croppedBuffer = await cropItemImage(imageBuffer, item.bbox, imageWidth, imageHeight);
        
        if (croppedBuffer) {
          const croppedBase64 = croppedBuffer.toString('base64');
          itemImageData = `data:${mimeType};base64,${croppedBase64}`;
          console.log(`Successfully cropped image for ${item.name}`);
        } else {
          console.log(`Failed to crop image for ${item.name}, using full image`);
          // Fallback to full image if cropping fails
          itemImageData = `data:${mimeType};base64,${base64Image}`;
        }
      } else {
        // No bbox available, use full image
        console.log(`No bbox for ${item.name}, using full image`);
        itemImageData = `data:${mimeType};base64,${base64Image}`;
      }

      // Add image data to each item
      const fullImageData = `data:${mimeType};base64,${base64Image}`;
      const itemWithImage = {
        ...item,
        imageData: itemImageData,
        imageMimeType: itemImageMimeType,
        fullImageData,
        bbox: item.bbox || null
      };

      // If the item already exists (match on canonical name and common variants), add the new qty to the stored qty
      const canonicalName = itemWithImage.canonicalName || canonicalizeName(itemWithImage.name);
      const nameVariants = generateNameVariants(canonicalName);
      const existingItem = await itemsCollection.findOne({
        $or: [
          { canonicalName },
          { name: { $in: nameVariants } }
        ]
      });
      const existingQty = Number.isFinite(existingItem?.qty) ? existingItem.qty : 0;
      const newQty = Math.max(0, existingQty + itemWithImage.qty);

      const updatePayload = {
        ...itemWithImage,
        qty: newQty,
        canonicalName
      };

      await itemsCollection.updateOne(
        {
          $or: [
            { canonicalName },
            { name: { $in: nameVariants } }
          ]
        },
        { $set: updatePayload },
        { upsert: true }
      );
      updatedItems.push(itemWithImage.name);
    }

    // Return the latest list of items
    const items = await itemsCollection.find({}).sort({ detectedAt: -1 }).toArray();
    const totalCount = items.length;
    
    console.log(`Upserted ${updatedItems.length} items. Total items: ${totalCount}`);
    res.json({
      status: 'ok',
      items,
      totalItems: totalCount
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
