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
const suppliersRouter = require('./routes/suppliers');
const poRouter = require('./routes/purchase_orders');
const transferRouter = require('./routes/transfers');
const returnsRouter = require('./routes/returns');
const reportsRouter = require('./routes/reports');
const usersRouter = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb allows large offline batch syncs

// Public
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter); // devices sync without needing a user login token (device auth can be added later)

// Protected (require a valid login token)
app.use('/api/items', authMiddleware, itemsRouter);
app.use('/api/grn', authMiddleware, grnRouter);
app.use('/api/dispatch', authMiddleware, dispatchRouter);
app.use('/api/inventory', authMiddleware, inventoryRouter);
app.use('/api/suppliers', authMiddleware, suppliersRouter);
app.use('/api/po', authMiddleware, poRouter);
app.use('/api/transfers', authMiddleware, transferRouter);
app.use('/api/returns', authMiddleware, returnsRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/users', authMiddleware, usersRouter);

// Static frontend (PC dashboard + scanner PWA)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZulWMS server running on port ${PORT}`));
