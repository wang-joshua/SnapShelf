import api from './client';

export const analyzeFridge = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  const { data } = await api.post('/analyze-fridge', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return data;
};

export const fetchItems = async () => {
  const { data } = await api.get('/fridge-items');
  return data;
};
