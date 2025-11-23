import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const getGroceryList = () => axios.get(`${API_BASE}/grocery/list`);
export const addGroceryItem = (payload) => axios.post(`${API_BASE}/grocery/add-item`, payload);
export const deleteGroceryItem = (id) => axios.delete(`${API_BASE}/grocery/item/${id}`);
export const getGroceryComparison = () => axios.get(`${API_BASE}/grocery/compare`);
