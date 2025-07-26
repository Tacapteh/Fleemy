import axios from 'axios';
import { auth } from './firebase';

const base = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const api = axios.create({
  baseURL: `${base.replace(/\/$/, '')}/api`,
});

api.interceptors.request.use(async (config) => {
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    } catch (e) {
      // ignore token retrieval errors
    }
  }
  return config;
});

export default api;
