// server.js
// Node 18+ recommended (built-in fetch). Run: node server.js

// Minimal static server for local development only
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
});