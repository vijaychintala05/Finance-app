import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp, { initDatabase } from "./server/src/index";
import { db } from "./server/src/database/db";

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize Database before accepting requests
  try {
    console.log('[Server] Initializing database migrations and default seeds...');
    await initDatabase();
  } catch (err) {
    console.error('[Server Fatal] Database migration/seed initialization failed:', err);
    if (process.env.NODE_ENV === 'production' || !db.isMemoryAllowed()) {
      console.error('[Server Fatal] Terminating production startup due to database initialization failure.');
      process.exit(1);
    }
  }

  // Mount Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    apiApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    apiApp.use(express.static(distPath));
    apiApp.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  apiApp.listen(PORT, "0.0.0.0", () => {
    console.log(`Finance Application & Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
