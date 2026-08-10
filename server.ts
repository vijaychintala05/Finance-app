import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./server/src/index";

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
