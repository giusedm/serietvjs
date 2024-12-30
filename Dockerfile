# node-backend/Dockerfile

FROM node:18-alpine

# Imposta la directory di lavoro
WORKDIR /app

# Copia il file package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze
RUN npm install --production

# Copia il resto del codice
COPY . .

# Esponi la porta
EXPOSE 7000

# Comando per avviare l'app
CMD ["node", "tvshow.js"]
