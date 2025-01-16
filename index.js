require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

let pool;

app.use(express.json());

const initializeDatabase = async () => {
  try {
    const tempPool = new Pool({
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      password: process.env.POSTGRES_PASSWORD,
    });

    const client = await tempPool.connect();

    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${process.env.POSTGRES_DB}'`);
    
    if (res.rows.length === 0) {
      console.log(`Database ${process.env.POSTGRES_DB} does not exist. Creating it...`);
      await client.query(`CREATE DATABASE ${process.env.POSTGRES_DB}`);
      console.log(`Database ${process.env.POSTGRES_DB} created successfully.`);
    }

    client.release();

    pool = new Pool({
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DB,
      password: process.env.POSTGRES_PASSWORD,
      port: process.env.POSTGRES_PORT,
    });

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS btc_blocks (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        number BIGINT NOT NULL,
        timestamp BIGINT NOT NULL
      );
    `;
    await pool.query(createTableQuery);
    console.log("Database table 'btc_blocks' initialized.");

  } catch (error) {
    console.error("Error initializing database:", error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

const fetchAndSaveBlockData = async () => {
  try {
    console.log("Fetching the latest BTC block data...");

    const response = await axios.get(process.env.BLOCKCHAIN_API_URL);

    const block = response.data;

    console.log("Fetched block data:", block);

    const { hash, height, time } = block;

    const timestamp = new Date(time).getTime();
    if (isNaN(timestamp)) {
      console.error("Invalid timestamp:", time);
      return;
    }

    const insertQuery = `
      INSERT INTO btc_blocks (hash, number, timestamp)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [hash, height, timestamp]);
    console.log("Block data saved to database:", result.rows[0]);
  } catch (error) {
    console.error("Error processing block data:", error);
  }
};

cron.schedule('*/5 * * * *', async () => {
  console.log("Cron job triggered - fetching and saving block data...");
  await fetchAndSaveBlockData();
});

app.get('/api/btc-block', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM btc_blocks ORDER BY id DESC LIMIT 1;');
    
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ message: 'No block data found' });
    }
  } catch (error) {
    console.error("Error fetching block data:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const startServer = async () => {
  try {
    if (process.env.NODE_ENV !== 'test') {
      await initializeDatabase();
    }

    app.listen(port, '0.0.0.0', () => {
      console.log(`Server is running on http://0.0.0.0:${port}`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

startServer();

process.on('SIGINT', async () => {
  console.log("Shutting down...");
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log("Shutting down...");
  await pool.end();
  process.exit(0);
});

module.exports = { app };
