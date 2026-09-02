require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: authRouter, authMiddleware } = require('./routes/auth');
const itemsRouter = require('./routes/items');
const grnRouter = require('./routes/grn');
const dispatchRouter = require('./routes/dispatch');
const syncRouter = require('./routes/sync');
const inventoryRouter = require('./routes/inventory');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb allows large offline batch syncs

// Public
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter); // devices sync without needing a user login token (device auth can be added later)

// Protected (require login token) -- comment out authMiddleware below while testing if needed
app.use('/api/items', itemsRouter);
app.use('/api/grn', grnRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/inventory', inventoryRouter);

// Static frontend (PC dashboard + scanner PWA)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZulWMS server running on port ${PORT}`));
