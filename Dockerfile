FROM node:20-slim

# Install Chromium with all required dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Configure environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DISPLAY=:99

WORKDIR /usr/src/app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /tmp/chrome-profile && \
    chmod -R 777 /tmp/chrome-profile && \
    mkdir -p tokens && \
    chown -R node:node tokens

USER node

CMD ["npm", "start"]
