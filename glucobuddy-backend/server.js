require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

app.set('trust proxy', 1);

/*
|--------------------------------------------------------------------------
| CORS Configuration
|--------------------------------------------------------------------------
*/

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without browser origin
    // (Postman, curl, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // Allow approved frontend origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`Blocked by CORS: ${origin}`);

    return callback(new Error('Not allowed by CORS'));
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE'],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  credentials: true
};

app.use(cors(corsOptions));

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: '10mb' }));

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.send('GlucoBuddy API running');
});

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const errorHandler = require('./middleware/errorMiddleware');

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/glucose', require('./routes/glucose'));
app.use('/api/insulin', require('./routes/insulin'));
app.use('/api/meals', require('./routes/meals'));
app.use('/api/dose', require('./routes/dose'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/data', require('./routes/data'));
app.use('/api/adaptive', require('./routes/adaptive'));

/*
|--------------------------------------------------------------------------
| Error Handling
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

/*
|--------------------------------------------------------------------------
| Server Startup
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});