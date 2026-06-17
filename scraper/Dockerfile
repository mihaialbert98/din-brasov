FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
