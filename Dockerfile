# ==============================================================================
# DevControl AI — Multi-Stage Production Dockerfile (Security Hardened)
# ==============================================================================

# Stage 1: Derleme Aşaması (Frontend & Backend Bundler)
FROM node:22-alpine AS builder

WORKDIR /app

# Bağımlılık katmanı önbellekleme
COPY package*.json ./
RUN npm ci

# Kaynak kodları kopyala ve üretim çıktısını derle
COPY . .
RUN npm run build

# Stage 2: Üretim Çalıştırma Aşaması (Minimal Saldırı Yüzeyi & Non-Root User)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Yalnızca üretim bağımlılıklarını kur
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Derlenmiş dist dosyalarını node kullanıcısı sahipliğinde kopyala
COPY --from=builder --chown=node:node /app/dist ./dist

# Güvenlik gereği root yerine yetkisiz node kullanıcısına geç
USER node

EXPOSE 8080

CMD ["node", "dist/server.cjs"]
