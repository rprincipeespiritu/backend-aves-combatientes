// server.js
require('dotenv').config();
const cds = require('@sap/cds');
const cors = require('cors');

const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
};

cds.on('bootstrap', (app) => {
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions)); // preflight
});

module.exports = cds.server;