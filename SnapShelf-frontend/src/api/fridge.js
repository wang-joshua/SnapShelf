import api from './client';

export const analyzeFridge = async (file) => {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const { data } = await api.post('/analyze-fridge', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000 // 2 minutes timeout
    });

    return data;
  } catch (error) {
    console.error('analyzeFridge error details:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      request: error.request
    });

    if (error.code === 'ECONNABORTED') {
      const timeoutError = new Error('Request timed out. The image analysis is taking longer than expected. Please try again.');
      timeoutError.isTimeout = true;
      throw timeoutError;
    } else if (error.response) {
      // Server responded with error status
      const errorMessage = error.response?.data?.error || error.message || 'Server error occurred';
      const serverError = new Error(errorMessage);
      serverError.status = error.response.status;
      serverError.responseData = error.response.data;
      throw serverError;
    } else if (error.request) {
      // Request was made but no response received
      const networkError = new Error('No response from server. Please check your connection and try again.');
      networkError.isNetworkError = true;
      throw networkError;
    } else {
      // Something else happened
      throw new Error(error.message || 'An unexpected error occurred');
    }
  }
};

export const fetchItems = async () => {
  const { data } = await api.get('/fridge-items');
  return data;
};
