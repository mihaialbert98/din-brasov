FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --ignore-scripts

# Install Playwright browsers
RUN npx playwright install chromium

COPY . .
RUN pnpm build

ENV PORT=4000
EXPOSE 4000

CMD ["node", "dist/index.js"]
