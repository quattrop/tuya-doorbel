FROM node:18-alpine

WORKDIR /app

# Instalace závislostí
COPY package.json ./
RUN npm install --production

# Kopírování aplikace
COPY . .

# Spouštíme přímo Node.js, žádný run.sh
CMD [ "node", "index.js" ]