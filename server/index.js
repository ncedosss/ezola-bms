require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // Heroku router

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// In dev, the Vite client runs on :5173 and proxies /api - CORS only needed if you skip the proxy
if (process.env.NODE_ENV !== 'production')
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/guesthouse', require('./routes/guesthouse'));
app.use('/api', require('./routes/sales'));          
app.use('/api/stock', require('./routes/stock'));
app.use('/api/petty', require('./routes/petty'));
app.use('/api', require('./routes/admin'));          


// Serve the built React app (Heroku: heroku-postbuild creates client/dist)
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => err && res.status(404).send('Client not built yet - run npm run heroku-postbuild'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`LES BMS API listening on :${PORT}`));
