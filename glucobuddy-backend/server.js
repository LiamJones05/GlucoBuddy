require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('GlucoBuddy API running');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/glucose', require('./routes/glucose'));
app.use('/api/insulin', require('./routes/insulin'));
app.use('/api/meals', require('./routes/meals'));
app.use('/api/dose', require('./routes/dose'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/data', require('./routes/data'));
