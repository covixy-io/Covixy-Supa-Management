FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV PANEL_DB_PATH=/app/data/panel.db

RUN mkdir -p /app/data

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["npm", "start"]
