import axios from 'axios';

// Configure axios for tests to use.
// The API's default port comes from API_PORT in .env (see .env.example).
const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '4000';
axios.defaults.baseURL = `http://${host}:${port}`;
