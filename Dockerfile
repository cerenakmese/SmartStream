# Hafif Node.js imajı kullan (Alpine Linux)
FROM node:18-alpine

# Çalışma klasörünü ayarla
WORKDIR /app

# Paket listesini kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install

# Tüm proje dosyalarını kopyala
COPY . .

# Portu dışarı aç
EXPOSE 3000

# Başlatma komutu
CMD ["npm", "start"]