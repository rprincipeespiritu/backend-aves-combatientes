const cds = require('@sap/cds')

const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}

cds.on('bootstrap', (app) => {
  const cors = require('cors')
  app.use(cors(corsOptions))
  app.options('*', cors(corsOptions))
})

module.exports = cds.server