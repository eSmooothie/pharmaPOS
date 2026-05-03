import axios from "axios";

// All backend routes are under /api, so same-origin requests work in both
// production (served by FastAPI) and dev (Vite proxies /api → :8000).
const api = axios.create({ baseURL: "/api" });

export default api;
