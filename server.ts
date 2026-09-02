import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ToolRegistry } from './server/toolRegistry.js';
import apiRoutes from './server/routes/api.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON request body parser
  app.use(express.json());

  // Araç Kayıt Defterini Başlat
  ToolRegistry.initialize();

  // Modüler API Route'ları
  app.use('/api', apiRoutes);

  // ==========================================
  // VITE / STATİK SUNUCU
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DevControl AI sunucusu http://0.0.0.0:${PORT} adresinde dinliyor`);
  });
}

startServer();
