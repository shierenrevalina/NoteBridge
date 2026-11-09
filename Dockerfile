# ==========================================
# Stage 1: Build Dependencies (Builder Stage)
# ==========================================
# (2) Menggunakan base image spesifik dengan tag versi konkret (bukan :latest)
FROM node:20-alpine3.19 AS builder

# (4) Menentukan direktori kerja aplikasi
WORKDIR /app

# (3) & (5) Menyalin dependency descriptor terlebih dahulu menggunakan COPY
# Mengisolasi instalasi package agar Docker layer caching bekerja optimal
COPY package*.json ./

# Install dependencies secara aman di dalam container
RUN npm install --omit=dev && npm cache clean --force

# Menyalin sisa source code setelah layer dependencies ter-cache
COPY . .

# ==========================================
# Stage 2: Production Minimal Runtime
# ==========================================
FROM node:20-alpine3.19 AS runner

# (4) WORKDIR dan environment variable untuk runtime produksi
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Menyalin package manifest dari builder
COPY --from=builder /app/package*.json ./

# Menyalin node_modules yang sudah bersih dari stage builder
COPY --from=builder /app/node_modules ./node_modules

# (5) Menyalin kode aplikasi dan static frontend dari builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public

# Menjalankan container dengan non-root user bawaan Alpine untuk keamanan
USER node

# (4) EXPOSE port aplikasi
EXPOSE 3000

# (4) CMD dalam Exec Form (JSON array: ["executable", "param1", ...])
CMD ["node", "src/server.js"]
