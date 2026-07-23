// Vercel Serverless Function entry point.
// The Express app is imported from the compiled backend.
// app.listen() is NOT called — Vercel manages the HTTP server.
import app from '../backend/dist/app.js';
export default app;
