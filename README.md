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
  - **Sıcak Nokta Radarı (Hotspots)**: En çok hata alan ve sık değişen kritik kaynak kod dosyalarını tespit eder.
  - **Mühendislik Riskleri (Risks)**: Durgun PR'lar, yüksek oynaklıktaki dosyalar ve dokümantasyon borçları.

### 3. 🤖 Google Gemini Yapay Zeka Entegrasyonu
- **Geliştirici Personası (Developer Persona)**: Son 30 günlük commit telemetriniz ve dilleriniz üzerinden teknik unvanınızı, süper güçlerinizi ve gelişim alanlarınızı sentezler.
- **Yapay Zeka Analisti (Ask AI / Agent Planner)**: Projeleriniz hakkında teknik sorular sorabileceğiniz, arka planda telemetri araçlarını (`get_hotspots`, `get_health_score`, vb.) çalıştıran otonom analist.
- **Depo İnceleme Raporu (AI Repo Review)**: Tek tıkla herhangi bir deponun mimarisini, güçlü yanlarını ve 14 günlük aksiyon planını çıkaran inceleme modalı.
- **Yeniden Düzenleme Planı (AI Refactoring Blueprint)**: Sıcak noktalardaki karmaşık dosyalar için somut SOLID / SRP refactoring adımları ve kod şablonları önerir.
- **Çoklu Model Yedekleme Zinciri (Fallback Chain)**: `gemini-3.7-flash` -> `gemini-3.5-flash-lite` -> `gemini-3.6-flash`.

---

## 🎨 Tasarım Mimarisi (60-30-10 Kuralı)
Arayüz, modern geliştirici araçları estetiği ve UI/UX standartları gözetilerek **yalnızca 3 renk** ile 60-30-10 kuralına göre tasarlanmıştır:
- **%60 DOMINANT (`#b9aba9`):** Dinlendirici, zarif toprak ve taş tonunda geniş ana tuval ve sayfa tabanı.
- **%30 SECONDARY (`#cdc1b5`):** Açık kumtaşı renginde Bento grid kartları, yan menü, üst bar ve paneller.
- **%10 ACCENT (`#f9b88e`):** Sıcak kayısı / mercan tonunda etkileşimli butonlar, aktif sekmeler ve durum rozetleri.
- **Tipografi:** WCAG AAA uyumlu yüksek kontrastlı zengin espresso mürekkep (`#231c1a`).

---

## 🛠️ Teknoloji Yığını

- **Frontend**: React 19, TypeScript, TailwindCSS, Recharts, Lucide React, Motion, TanStack React Query
- **Backend**: Node.js, Express, Google GenAI SDK (`@google/genai`), express-rate-limit
- **Bulut & Dağıtım**: Google Cloud Run, Google Cloud Secret Manager, Firebase Hosting, Docker (Multi-stage Alpine)
- **Araçlar & Derleme**: Vite 6, esbuild, tsx watch

---

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler
- **Node.js**: v18 veya üzeri
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
```

> **Önemli Güvenlik Notu**: `.env` dosyası `.gitignore` ve `.dockerignore` ile korunmaktadır. API anahtarlarınız ve GitHub tokenınız asla istemciye veya git reposuna sızdırılmaz.

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
| `npm run dev` | Frontend ve Backend'i canlı yenileme (`tsx watch`) ile başlatır |
| `npm run build` | Üretim için optimize edilmiş bundle'ı (`dist/`) derler |
| `npm start` | Derlenmiş üretim sunucusunu çalıştırır |
| `npm run lint` | TypeScript tip denetimini (`tsc --noEmit`) çalıştırır |

---

## 🔒 Gizlilik ve Güvenlik
- Sistemde **hiçbir sahte (mock / dummy)** veri bulunmaz.
- Arayüzden token değiştirme devre dışıdır; sunucu tamamen yerel `.env` veya Google Cloud Secret Manager üzerinden çalışır.
- GitHub verileriniz üçüncü şahıs sunuculara iletilmez, yalnızca kendi oturumunuzda analiz edilir.

---

## 📄 Lisans
Bu proje MIT lisansı altında lisanslanmıştır. Geliştirici: **[Yücel Gümüş](https://yucelgumus.dev/)**.