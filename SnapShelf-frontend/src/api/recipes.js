import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const getAllRecipes = () => axios.get(`${API_BASE}/recipes/all`);
export const getRecipeRecommendations = () => axios.get(`${API_BASE}/recipes/recommend`);
export const addMissingToGrocery = (payload) =>
  axios.post(`${API_BASE}/recipes/add-missing-to-grocery`, payload);
export const generateRecipes = () => axios.post(`${API_BASE}/recipes/generate`);
