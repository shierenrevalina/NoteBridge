const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'notebridge_db',
  user: process.env.DB_USER || 'notebridge_user',
  password: process.env.DB_PASSWORD || 'dummy_secret_password_123',
  connectionTimeoutMillis: 5000,
});

// Redis Client (Bonus feature)
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
});

let isRedisConnected = false;
redisClient.on('error', (err) => {
  console.warn('[Redis Warning] Cache unavailable:', err.message);
  isRedisConnected = false;
});
redisClient.on('connect', () => {
  console.log('[Redis] Connected to caching layer successfully.');
  isRedisConnected = true;
});

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('[Redis] Operating without cache:', err.message);
  }
})();

// Initialize database schema and dummy seed data
async function initDB() {
  const query = `
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      course_code VARCHAR(100) NOT NULL,
      description TEXT,
      author VARCHAR(100) DEFAULT 'Mahasiswa Anonim',
      file_name VARCHAR(255) DEFAULT 'catatan-kuliah.pdf',
      downloads INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log('[PostgreSQL] Database schema verified/created.');

    // Seed dummy data if empty
    const countRes = await pool.query('SELECT COUNT(*) FROM notes');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      const seedQuery = `
        INSERT INTO notes (title, course_code, description, author, file_name, downloads)
        VALUES 
          ('MTH 202 Quiz Solutions & Review', 'MTH 202', 'Lengkap dengan pembahasan kalkulus multivariabel bab 1-4', 'Oscar Oliver', 'mth202-quiz-solutions.pdf', 8),
          ('CSC 204 Reading Materials & Summary', 'CSC 204', 'Rangkuman lengkap materi Cloud Computing & Virtualization', 'Cybersmith', 'csc204-cloud-summary.pdf', 15),
          ('CSC 205 Exam Past Questions (2024-2025)', 'CSC 205', 'Kumpulan soal UTS tahun lalu beserta kunci jawaban', 'Alex Binder', 'csc205-exam-past.pdf', 10),
          ('CSC 203 Software Project Proposal Template', 'CSC 203', 'Panduan dan template resmi proposal software engineering', 'Kelompok 4', 'csc203-proposal-template.pdf', 5),
          ('CSC 201 Lecture Notes - Data Structures', 'CSC 201', 'Catatan tangan rapi bab Tree, Graph, dan Dynamic Programming', 'Siti Rahma', 'csc201-data-structures.pdf', 12);
      `;
      await pool.query(seedQuery);
      console.log('[PostgreSQL] Seed data successfully populated.');
    }
  } catch (err) {
    console.error('[PostgreSQL Error] Failed to initialize DB:', err.message);
  }
}
initDB();

// 1. Requirement: GET /health
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    const isDbHealthy = dbCheck.rowCount === 1;

    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      services: {
        database: isDbHealthy ? 'HEALTHY' : 'UNHEALTHY',
        redis_cache: isRedisConnected ? 'CONNECTED' : 'STANDALONE_FALLBACK',
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      error: err.message,
    });
  }
});

// 2. Requirement: GET /api/notes (Read endpoint with caching & search query)
app.get('/api/notes', async (req, res) => {
  const { search } = req.query;
  const cacheKey = search ? `notes:search:${search}` : 'notes:all';

  // Check Redis cache first
  if (isRedisConnected) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          source: 'cache',
          data: JSON.parse(cached),
        });
      }
    } catch (err) {
      console.warn('Cache read failed:', err.message);
    }
  }

  try {
    let query = 'SELECT * FROM notes ORDER BY id DESC';
    let params = [];

    if (search) {
      query = 'SELECT * FROM notes WHERE title ILIKE $1 OR course_code ILIKE $1 OR author ILIKE $1 ORDER BY id DESC';
      params = [`%${search}%`];
    }

    const result = await pool.query(query, params);

    // Save to cache with 60s TTL
    if (isRedisConnected) {
      try {
        await redisClient.setEx(cacheKey, 60, JSON.stringify(result.rows));
      } catch (err) {
        console.warn('Cache write failed:', err.message);
      }
    }

    res.status(200).json({
      source: 'database',
      count: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', message: err.message });
  }
});

// 3. Requirement: POST /api/notes (Write endpoint with status 201)
app.post('/api/notes', async (req, res) => {
  const { title, course_code, description, author, file_name } = req.body;

  if (!title || !course_code) {
    return res.status(400).json({ error: 'Title and course_code are required.' });
  }

  try {
    const insertQuery = `
      INSERT INTO notes (title, course_code, description, author, file_name, downloads)
      VALUES ($1, $2, $3, $4, $5, 0)
      RETURNING *;
    `;
    const values = [
      title,
      course_code,
      description || 'Tidak ada deskripsi',
      author || 'Cybersmith',
      file_name || 'catatan-kuliah.pdf',
    ];

    const result = await pool.query(insertQuery, values);

    // Invalidate Redis cache
    if (isRedisConnected) {
      try {
        const keys = await redisClient.keys('notes:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (err) {
        console.warn('Cache invalidation failed:', err.message);
      }
    }

    res.status(201).json({
      message: 'Catatan berhasil diunggah ke NoteBridge!',
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert note into database', message: err.message });
  }
});

// Endpoint to simulate download / increment download count
app.post('/api/notes/:id/download', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE notes SET downloads = downloads + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Catatan tidak ditemukan' });
    }
    res.status(200).json({
      message: 'Download berhasil dimulai',
      download_url: `/downloads/${result.rows[0].file_name}`,
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`[NoteBridge Server] Running on http://localhost:${port}`);
});
