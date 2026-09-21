# 🚀 DevControl AI - Mühendislik Zekası ve Kişisel GitHub Analiz Platformu

[![Canlı Uygulama](https://img.shields.io/badge/Canl%C4%B1%20Uygulama-devcontrol--ai.web.app-brightgreen?style=for-the-badge&logo=firebase)](https://devcontrol-ai.web.app)
[![Geliştirici](https://img.shields.io/badge/Geli%C5%9Ftirici-Y%C3%BCcel%20G%C3%BCm%C3%BC%C5%9F-blue?style=for-the-badge&logo=googlechrome)](https://yucelgumus.dev/)
[![GitHub](https://img.shields.io/badge/GitHub-@yucel--gumus-181717?style=for-the-badge&logo=github)](https://github.com/yucel-gumus)

**DevControl AI**, kişisel GitHub depolarınızı ve geliştirici telemetrinizi derinlemesine analiz eden, deterministik mühendislik sağlık skorları hesaplayan ve Google Gemini yapay zeka modelleriyle zenginleştirilmiş aksiyon planları sunan yeni nesil bir mühendislik zekası platformudur.

---

## 🌐 Canlı Uygulama Bağlantıları

- 🌟 **Canlı Web Uygulaması:** [https://devcontrol-ai.web.app](https://devcontrol-ai.web.app)
- 🔗 **Alternatif Canlı URL:** [https://devcontrol-ai.firebaseapp.com](https://devcontrol-ai.firebaseapp.com)

---

## 👨‍💻 Geliştirici Bilgileri (Author & Developer)

Bu proje **[Yücel Gümüş](https://yucelgumus.dev/)** tarafından sıfırdan tasarlanmış, geliştirilmiş ve canlıya alınmıştır.

- 🌐 **Kişisel Web Sitesi:** [https://yucelgumus.dev/](https://yucelgumus.dev/)
- 🐙 **GitHub Profili:** [@yucel-gumus](https://github.com/yucel-gumus)
- 💼 **Uzmanlık:** Yazılım Geliştirme, Yapay Zeka Ajanları (Agentic AI), Bulut Mimarileri ve Veri Sistemleri

---

## 🌟 Öne Çıkan Özellikler

### 1. 🔍 %100 Gerçek GitHub Telemetrisi
- **Kişisel Depo Analizi**: Sadece size ait olan depoları tarar; yıldız, fork, dil ve aktivite dağılımını gösterir.
- **Commit ve Kod Oynaklığı (Churn)**: Hangi günlerde ne kadar kod eklendiğini/silindiğini, hata düzeltme commit oranlarını ve geliştirme temposunu analiz eder.
- **Çekme İsteği (PR) & Sorun (Issue) Radarı**: Bekleyen, durgunlaşan (stale) veya inceleme bekleyen kayıtları tespit eder.
- **Canlı API Kotası Takibi**: GitHub API istek limitinizi navbar üzerinde gerçek zamanlı görüntüler.

### 2. 📊 Deterministik Mühendislik Sağlık Skoru (Health Score)
- Yapay zeka tahminlerine veya halüsinasyonlara izin vermeyen **matematiksel metrik motoru**:
  - **Kod Sağlığı (Code Health)**: Hata düzeltme oranı ve ortalama commit dalgalanmasına göre puanlama.
  - **Teslimat Ritmi (Delivery)**: Kişisel commit frekansı ve PR yaşam döngüsü hızı.
  - **Kritik Dosyalar Radarı (Hotspots)**: En çok hata alan ve sık değişen kritik kaynak kod dosyalarını tespit eder.
  - **Mühendislik Riskleri (Risks)**: Durgun PR'lar, yüksek oynaklıktaki dosyalar ve dokümantasyon borçları.

### 3. 🤖 Google Gemini Yapay Zeka Entegrasyonu
- **Geliştirici Personası (Developer Persona)**: Son 7 günlük commit telemetriniz ve dilleriniz üzerinden teknik unvanınızı, süper güçlerinizi ve gelişim alanlarınızı sentezler.
- **KENSAI — Yapay Zeka Analisti (Ask AI / Agent Planner)**: Projeleriniz hakkında teknik sorular sorabileceğiniz, arka planda telemetri araçlarını (`get_hotspots`, `get_health_breakdown`, `get_engineering_risks`, vb.) çalıştıran otonom analist. Arayüzdeki adı (başlık düğmesi, sohbet balonları, inceleme modalları) **KENSAI**'dir; aynı ad sunucudaki ajan sistem isteminde de kullanılır, böylece model kendini arayüzde göründüğü adla tanıtır.
- **Depo İnceleme Raporu (AI Repo Review)**: Tek tıkla herhangi bir deponun mimarisini, güçlü yanlarını, teknik borçlarını ve önceliklendirilmiş (Yüksek/Orta/Düşük) aksiyon planını çıkaran inceleme modalı.
- **Yeniden Düzenleme Planı (AI Refactoring Blueprint)**: Kritik dosyalardaki karmaşık modüller için somut SOLID / SRP refactoring adımları ve kod şablonları önerir.
- **Çoklu Model Yedekleme Zinciri (Fallback Chain)**: `gemini-3.8-flash` -> `gemini-3.7-flash` -> `gemini-3.6-flash` -> `gemini-3.5-flash` -> `gemini-3.5-flash-lite`. Zincir en yetenekli modelden başlar; geçici hatalarda (429 / 503 / zaman aşımı) üstel geri çekilme ile sıradaki modele düşer.

### 4. 🎯 TypeSafe AI System One (Jev) Karar Katmanı
`TYPESAFE_API_KEY` tanımlıysa ajan planlayıcısı, LLM sentezinden **önce** ve **sonra** iki deterministik karar adımı çalıştırır:
- **Niyet Yönlendirmesi (Intent Routing)**: Kullanıcı sorgusunu ve depo bağlamını `state` olarak gönderir; tek bir System One çağrısında `choice` (hangi araçlar çalıştırılmalı), `noul` (sorgu doğrudan bir metrikle yanıtlanabilir mi) ve `score` (aciliyet) sorularını yanıtlar. Araç seçimini belirleyen `choice` ve istemi biçimlendiren `score` yanıtları güveni `0.45`in altındaysa yok sayılır; `noul` yanıtı güven alanı taşımadığı için kendi değer eşiğiyle (`noul < 0.7`) süzülür.
- **Kanıt Doğrulaması (Fact-Check)**: Gemini sentezinden sonra üretilen yanıt, çalıştırılan araçların gerçek çıktılarıyla karşılaştırılır. `noul` değeri 0.5'in altındaysa yanıtın sonuna kullanıcıya görünen bir **Kanıt Doğrulama Uyarısı** eklenir.

TypeSafe erişilemezse (anahtar yok, ağ hatası, 429) ajan sessizce Gemini-only moduna düşer; uydurma bir cevap üretilmez. Gemini de erişilemezse yanıt, ölçülen telemetriden üretilen deterministik bir özetle verilir (bkz. `AgentPlanner.generateTelemetryFallback`).

---

## 🎨 Tasarım Mimarisi (60-30-10 Kuralı)
Arayüz, modern geliştirici araçları estetiği ve UI/UX standartları gözetilerek **yalnızca 3 renk** ile 60-30-10 kuralına göre tasarlanmıştır:
- **%60 DOMINANT (`#b9aba9`):** Dinlendirici, zarif toprak ve taş tonunda geniş ana tuval ve sayfa tabanı.
- **%30 SECONDARY (`#cdc1b5`):** Açık kumtaşı renginde Bento grid kartları, yan menü, üst bar ve paneller.
- **%10 ACCENT (`#f9b88e`):** Sıcak kayısı / mercan tonunda etkileşimli butonlar, aktif sekmeler ve durum rozetleri.
- **Tipografi:** WCAG AAA uyumlu yüksek kontrastlı zengin espresso mürekkep (`#231c1a`).

---

## 🛠️ Teknoloji Yığını

- **Frontend**: React 19, TypeScript, TailwindCSS, Recharts, Lucide React, TanStack React Query
- **Backend**: Node.js, Express, Google GenAI SDK (`@google/genai`), TypeSafe AI System One (Jev), express-rate-limit
- **Bulut & Dağıtım**: Google Cloud Run, Google Cloud Secret Manager, Firebase Hosting, Docker (Multi-stage Alpine)
- **Araçlar & Derleme**: Vite 6, esbuild, tsx watch

---

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler
- **Node.js**: v22 veya üzeri (üretim imajı `node:22-alpine`; `package.json` içindeki `engines` alanı bu alt sınırı bildirir)
- **GitHub Personal Access Token**: `repo` ve `read:user` yetkili bir token ([Oluşturma Bağlantısı](https://github.com/settings/tokens))
- **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)'dan alınan ücretsiz API anahtarı

### 2. Kurulum
Depoyu klonlayın ve bağımlılıkları yükleyin:
```bash
git clone https://github.com/yucel-gumus/DevControl-AI.git
cd DevControl-AI
npm install
```

### 3. Ortam Değişkenlerini Yapılandırma
`.env.example` dosyasını `.env` olarak kopyalayın ve anahtarlarınızı girin:
```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:
```env
# Google Gemini API Anahtarı
GEMINI_API_KEY="AIzaSy..."

# GitHub Personal Access Token (yalnızca kendi hesabınız kullanılır)
GITHUB_TOKEN="ghp_..."

# TypeSafe AI System One (Jev) — opsiyonel karar katmanı
TYPESAFE_API_KEY="ts_..."
```

> **Önemli Güvenlik Notu**: `.env` dosyası `.gitignore` ve `.dockerignore` ile korunmaktadır. API anahtarlarınız, TypeSafe anahtarınız ve GitHub tokenınız asla istemciye veya git reposuna sızdırılmaz. `TYPESAFE_API_KEY` de dahil tüm gizli anahtarlar yalnızca sunucu tarafında `process.env` üzerinden okunur; istemci paketine gömülmez.

### 3.1. Opsiyonel: API Erişim Kapısı
`DEVCONTROL_API_TOKEN` tanımlarsanız `/api/health` dışındaki tüm `/api/*` uç noktaları bir jeton ister (`Authorization: Bearer <jeton>` veya `X-Api-Token: <jeton>`, sabit zamanlı karşılaştırma ile). Sağlık ucu jeton istemez: dış izleme (uptime / readiness) probları jeton taşımaz ve kapı açıkken 401 alsalardı sağlıklı bir sürüm sağlıksız sayılırdı. Tarayıcıdan kullanmak için jetonu bir kez localStorage'a yazın:

```js
localStorage.setItem('devcontrol_api_token', '<jeton>')
```

Boş bırakılırsa kapı devre dışıdır ve uygulama eskisi gibi çalışır. Bu özellik, uygulamayı herkese açık bir adrese dağıttığınızda GitHub tokenınızın sizin adınıza kullanılmasını engellemek içindir.

### 3.2. Zaman Aşımları ve Uç (Edge) Sınırı

`firebase.json` tüm istekleri (`"source": "**"`) Cloud Run servisine rewrite eder ve **Firebase Hosting, Cloud Run'a proxy'lediği bir isteği 60 saniyede keser** (bu sınır yükseltilemez; kesilen istek istemciye 504 ağ geçidi sayfası olarak döner). Cloud Run'ın kendi zaman aşımı bu yüzden hiçbir zaman bağlayıcı olmaz.

İstemci, uç katmanın keseceği bir isteği beklemek yerine kendi iptalini yapar: `src/utils/apiClient.ts` içindeki bütçe, uç sınırına indirgenir (5 sn emniyet payıyla) ve kullanıcıya ayrıştırılamayan bir 504 yerine "İstek zaman aşımına uğradı" mesajı gösterilir. Uç sınırı **olmayan** kurulumlarda (doğrudan Cloud Run adresi, yerel `npm start`) tam bütçelerin kullanılabilmesi için sınır `VITE_EDGE_TIMEOUT_MS` ile bildirilir (derleme anında pakete gömülür):

```env
# Uç katmanı yoksa (doğrudan Cloud Run / yerel çalıştırma): sınırı kapat
VITE_EDGE_TIMEOUT_MS=0
# Ya da gerçek sınırı bildir (ör. 300 sn):
# VITE_EDGE_TIMEOUT_MS=300000
```

> **Dağıtım notu (darboğaz)**: Hosting arkasında 60 sn'yi aşan bir istek hiçbir zaman sonuç döndüremez. Soğuk başlangıçta ilk GitHub eşitlemesi bu süreyi aşabilir; bu durumda eşitlemeyi bekleyen uçlar (brifing, persona, depo incelemesi) istemci tarafından iptal edilir ve sunucu ölçüm üretmeye devam eder. Kalıcı çözüm, eşitlemeyi istekten ayırmaktır (eşitlemeyi arka planda başlatıp istemciyi durum yoklamasına yönlendirmek); uygulama şu an eşitlemeyi istek içinde yapar ve bu sınırla yaşar.

### 4. Uygulamayı Çalıştırma
Geliştirme sunucusunu başlatın:
```bash
npm run dev
```
Uygulama otomatik olarak `http://localhost:3000` adresinde açılacaktır.

---

## 📦 Proje Komutları

| Komut | Açıklama |
| :--- | :--- |
| `npm run dev` | Frontend ve Backend'i canlı yenileme (`tsx watch`) ile başlatır; istemciyi Vite ara katmanından (kaynak koddan) servis eder |
| `npm run build` | Üretim için optimize edilmiş bundle'ı (`dist/`) derler |
| `npm start` | Derlenmiş paketi (`dist/server.cjs`) çalıştırır ve istemciyi `dist/` içinden servis eder (önce `npm run build` gerekir; derlenmiş çıktı yoksa sunucu açık bir hata mesajıyla başlamaz) |
| `npm run lint` | TypeScript tip denetimini (`tsc --noEmit`) çalıştırır |

---

## 🔒 Gizlilik ve Güvenlik
- Sistemde **hiçbir sahte (mock / dummy)** veri bulunmaz.
- Arayüzden token değiştirme devre dışıdır; sunucu tamamen yerel `.env` veya Google Cloud Secret Manager üzerinden çalışır.
- **Deterministik motorlar yereldir**: sağlık skoru, hotspot, risk ve aktivite hesapları kendi sunucunuzda çalışır ve hiçbir ağ çağrısı yapmaz.
- **Üçüncü taraf veri akışı (şeffaflık)**: Yapay zeka özellikleri (Ask AI, geliştirici personası, depo incelemesi, commit sınıflandırma) için GitHub telemetrisinden **türetilmiş bağlam** — commit mesajları, dosya yolları, PR/issue başlıkları ve depo meta verileri — Google Gemini API'sine (`generativelanguage.googleapis.com`) gönderilir. `TYPESAFE_API_KEY` tanımlıysa veri TypeSafe AI'a (`api.typesafe.ai`) iki adımda da gider: **niyet yönlendirmesinde** sorunuzun metni, hedef depo adı ve izlenen depo adları; **kanıt doğrulamasında** ölçülen projeksiyon (hedef/izlenen depo adları, sağlık skoru, risk seviyesi, dil, fork ve yıldız sayıları, araç sonuçlarından üretilen kanıt satırları, telemetri durumu) ile üretilen yapay zeka cevabının ilk 4000 karakteri (`yapayZekaCevabi`). **Hiçbir ağ çağrısı yapılmayan tek durum, iki anahtarın da tanımlı olmamasıdır**: `GEMINI_API_KEY` yoksa yapay zeka sentezi (Gemini) hiç çağrılmaz; ancak `TYPESAFE_API_KEY` tanımlıysa yalnızca niyet yönlendirmesi ve kanıt doğrulaması adımları TypeSafe üzerinden çalışır ve yukarıdaki bağlam TypeSafe'e gider. API anahtarları, GitHub tokenınız ve ham depo içeriği (dosya gövdeleri) bu isteklerin dışında tutulur; bunların dışında hiçbir üçüncü tarafa veri aktarılmaz.

---

## 📄 Lisans
Bu proje MIT lisansı altında lisanslanmıştır. Geliştirici: **[Yücel Gümüş](https://yucelgumus.dev/)**.