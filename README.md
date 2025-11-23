# SnapShelf

SnapShelf lets you scan your fridge, store detected items in MongoDB, manage a grocery list, compare what you need versus what you have, and browse/generate recipe ideas.

## Project Structure
- `SnapShelf-backend/` – Express API (image analysis, items, grocery list, recipes)
- `SnapShelf-frontend/` – React app (inventory, grocery list, compare, recipes)

## Prerequisites
- Node.js 18+
- npm
- MongoDB connection string
- Google Gemini API key (for image and recipe generation)

## Setup
1) Clone or download this repo.
2) Install dependencies:
```bash
cd SnapShelf-backend && npm install
cd ../SnapShelf-frontend && npm install
```
3) Create backend env (`SnapShelf-backend/.env`):
```bash
PORT=4000
GEMINI_API_KEY=your_api_key
MONGO_URI=your_mongo_uri
MONGO_DB_NAME=snapshelf
GEMINI_MODEL=gemini-2.0-flash   # optional override
```
4) (Optional) Frontend env (`SnapShelf-frontend/.env`):
```bash
VITE_API_BASE_URL=http://localhost:4000
```

## Running
In two terminals:
```bash
# Backend
cd SnapShelf-backend
npm start      # or npm run dev for nodemon

# Frontend
cd SnapShelf-frontend
npm run dev    # Vite dev server
```
Visit the frontend URL shown by Vite (typically http://localhost:5173) with the backend on port 4000.

## Using the App
- **Scan Fridge (Snap)**: Upload a fridge photo; detected items are saved to MongoDB with images. Quantities add cumulatively for existing items.
- **Inventory**: Browse items in a responsive grid, search, filter, sort, and see cropped previews on hover.
- **Grocery List**: Add items (capitalized), set quantity, category; delete as needed.
- **Compare**: See what’s fully covered, partially covered, or missing by comparing grocery list to fridge items.
- **Recipes**: View “Can Make Now” and “May Need More Ingredients” based on exact name matching. Missing ingredients can be added to the grocery list from the modal.
- **Generate Recipes**: Use the refresh on Recipes to re-prompt Gemini with current fridge items.

## Notes
- Names are normalized internally for matching; display names are capitalized.
- Recipe matching is strict: lowercase, trimmed names only; no fuzzy matching.
- Missing ingredients 1–2 → “May Need More Ingredients”; 0 → “Can Make Now”; 3+ are ignored.
