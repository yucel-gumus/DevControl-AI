import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ToolRegistry } from './server/toolRegistry.js';
import { FirestoreService } from './server/db/firestoreService.js';
import apiRoutes from './server/routes/api.js';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run / Firebase Hosting arkasında istemci IP'si X-Forwarded-For ile gelir.
  // Varsayılan istek yolu iki proxy'den geçer: Firebase Hosting'in Google Front
  // End'i ve Cloud Run'ın kendi ön ucu; bu yüzden sağdan İKİ atlama güvenilirdir.
  //
  // SAYI GERÇEKLE UYUŞMALI: güvenilen atlama sayısı gerçekte geçilen proxy
  // sayısından FAZLA olursa proxy-addr zincirin en solundaki — istemcinin
  // yazdığı — adrese düşer ve `req.ip` saldırganın uydurduğu değere dönüşür;
  // express-rate-limit (varsayılan anahtar: req.ip) de her isteği yeni bir
  // istemci sayar, yani limit hiç tetiklenmez. Cloud Run URL'sine doğrudan
  // erişilen bir kurulumda bu yüzden TRUST_PROXY_HOPS=1 verilmelidir.
  // 1'in maliyeti: Firebase Hosting yolunda `req.ip` paylaşılan GFE çıkış IP'si
  // olur ve tüm ziyaretçiler TEK sayaçta toplanır (biri limiti doldurunca herkes
  // 429 alır). Express'in `true` (tüm zincire güven) ayarı hiçbir kurulumda
  // kullanılmaz: her koşulda istemci uydurmasına açıktır.
  const configuredTrustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 2);
  const trustProxyHops = Number.isInteger(configuredTrustProxyHops) && configuredTrustProxyHops >= 1
    ? configuredTrustProxyHops
    : 2;
  // Geçersiz bir değer sessizce 2'ye düşerse operatör ayarının uygulandığını
  // sanır: doğrudan Cloud Run'a erişilen bir kurulumda bu, `req.ip`'in istemci
  // uydurmasına açık kalması (ve hız sınırının baypas edilebilmesi) demektir.
  if (process.env.TRUST_PROXY_HOPS !== undefined && trustProxyHops !== configuredTrustProxyHops) {
    console.warn(
      `[DevControl AI] TRUST_PROXY_HOPS="${process.env.TRUST_PROXY_HOPS}" geçersiz sayı; ` +
      `${trustProxyHops} atlama varsayıldı. Cloud Run'a doğrudan erişilen kurulumda TRUST_PROXY_HOPS=1 verilmelidir.`,
    );
  }
  app.set('trust proxy', trustProxyHops);
  const PORT = Number(process.env.PORT) || 3000;

  // HTTP Güvenlik Başlıkları (Security Headers)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // JSON request body parser
  app.use(express.json());

  // Firestore & Araç Kayıt Defterini Başlat
  FirestoreService.initialize();
  ToolRegistry.initialize();

  // Modüler API Route'ları
  app.use('/api', apiRoutes);

  // Geçersiz API rotaları için 404 JSON yanıtı (SPA HTML dönülmesini önler)
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'İstenen API uç noktası bulunamadı.' });
  });

  // ==========================================
  // VITE / STATİK SUNUCU
  // ==========================================
  // Modu NODE_ENV tek başına belirleyemez: `npm start` derlenmiş paketi
  // (dist/server.cjs) çalıştırır ama NODE_ENV taşımaz — NODE_ENV'e bakan eski
  // koşul bu yüzden `npm start`'ı geliştirme moduna düşürüyordu. Sonuç: dist
  // dururken kaynak kod servis edilir (README bu komutu "derlenmiş üretim
  // sunucusu" diye tanımlar) ve `npm ci --omit=dev` ile kurulmuş bir makinede
  // `vite` bir devDependency olduğu için süreç, bağlantı noktasını dinlemeye
  // başlamadan ERR_MODULE_NOT_FOUND ile düşerdi. Bu yüzden ölçüt ÇALIŞTIRILAN
  // MODÜLDÜR: kaynak `server.ts` tsx ile (npm run dev), paket `dist/server.cjs`
  // node ile çalışır. Açıkça verilen NODE_ENV her zaman bu ölçütün önüne geçer
  // (Docker/Cloud Run: NODE_ENV=production).
  //
  // Ölçüt `__filename`dir, `import.meta.url` DEĞİL: esbuild paketi CJS olarak
  // derler ve orada `import.meta` boş bir nesnedir ("import.meta is not
  // available with the cjs output format" uyarısı), yani `import.meta.url`
  // `undefined` olur ve bu satır sunucuyu başlatma anında düşürürdü. `__filename`
  // ise CJS pakette tanımlıdır; kaynak tsx ile ESM olarak çalıştığında (package
  // type: module) tanımsızdır.
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const runsFromBuiltBundle = typeof __filename !== 'undefined';
  const serveBuiltAssets = process.env.NODE_ENV
    ? process.env.NODE_ENV === 'production'
    : runsFromBuiltBundle;

  if (serveBuiltAssets) {
    // Derlenmiş çıktı yoksa SPA istekleri `sendFile` hatasıyla 500'e düşer ve
    // günlükte yalnızca bir yığın izi kalırdı; eksik derleme, sessizce servis
    // edilen kırık bir arayüz değil açık bir başlangıç hatasıdır.
    if (!fs.existsSync(distIndexPath)) {
      throw new Error(
        `Derlenmiş istemci çıktısı bulunamadı: ${distIndexPath}. Önce 'npm run build' çalıştırın.`,
      );
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Ele alınmamış hatalar için JSON sözleşmesi.
  //
  // Express'in varsayılan hata işleyicisi HTML gövde (ve yığın izi) döndürür;
  // istemci ise gövdeyi JSON olarak çözmeye çalışır. Bu ara katman olmadan
  // rotalardan sızan tek bir hata (`next(err)`) kullanıcıya JSON yerine hata
  // sayfası gösterir ve rotaların 400/404/502 sözleşmeleri tutarsızlaşırdı.
  // Yığın izi yanıta asla yazılmaz; sunucu günlüğüne yazılır. En sonda
  // kaydedilir: yalnızca yukarıdaki ara katmanlardan geçen hatalar buraya düşer.
  app.use(((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const message = err instanceof Error && err.message ? err.message : 'Sunucu hatası.';
    console.error('[DevControl AI] Ele alınmayan istek hatası:', err);
    // Başlıklar çoktan gittiyse bu ara katman bir gövde YAZAMAZ; ama isteği
    // burada bırakmak da yanlıştır: Express sözleşmesi bu durumda hatanın
    // varsayılan işleyiciye devredilmesini ister (bkz. finalhandler), o da
    // soketi kapatır. Devredilmezse istemci yanıtı hiç sonlanmayan bir istekte
    // kendi zaman aşımına kadar bekler (ör. dist/index.html akışı ortasında
    // düşen bir okuma hatası).
    if (res.headersSent) {
      return next(err);
    }
    // Durum kodu hata nesnesinden okunur (varsayılan 500).
    //
    // Buraya düşen her hata sunucu hatası DEĞİLDİR: `express.json()` bu ara
    // katmanların ÖNÜNDE bağlandığı için gövde ayrıştırma hataları doğrudan
    // buraya gelir ve istemci hatasıdır (bozuk JSON: 400, `entity.parse.failed`;
    // 100 KB sınırı aşımı: 413, `entity.too.large`). Hepsini 500'e sabitlemek
    // istemci hatasını sunucu arızası gibi raporlar — izleme/uyarı sistemi
    // sağlıklı sunucuyu arızalı gösterir ve çağıran taraf isteği düzeltmez.
    // Koda yalnızca 4xx/5xx aralığındaki geçerli bir değer kabul edilir;
    // uydurma/aralık dışı bir değer yanıta yazılmaz.
    const statusCandidate =
      (err as { status?: unknown; statusCode?: unknown })?.status
      ?? (err as { status?: unknown; statusCode?: unknown })?.statusCode;
    const status =
      typeof statusCandidate === 'number' && statusCandidate >= 400 && statusCandidate <= 599
        ? statusCandidate
        : 500;
    res.status(status).json({ error: message });
  }) as express.ErrorRequestHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DevControl AI sunucusu http://0.0.0.0:${PORT} adresinde dinliyor`);
  });
}

startServer().catch((err: unknown) => {
  // Başlangıç hataları (eksik derleme, dolu bağlantı noktası, modül yüklenemedi)
  // açıklamasız bir yığın iziyle değil, tek satırlık okunur bir mesajla bildirilir;
  // süreç 1 koduyla çıkar ve konteyner yeniden başlatılır.
  console.error(
    '[DevControl AI] Sunucu başlatılamadı:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
