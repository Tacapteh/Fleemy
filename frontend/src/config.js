// ✅ FIXED for production
export const API_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:8000"
    : "https://fleemy.onrender.com";
