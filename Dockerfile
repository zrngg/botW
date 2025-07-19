FROM node:20-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium manually (venom-bot needs this)
RUN apt-get update && apt-get install -y chromium

# Set working directory
WORKDIR /usr/src/app

# Copy dependencies
COPY package*.json ./
RUN npm install --production

# Copy app
COPY . .

# Create directory for venom sessions
RUN mkdir -p tokens

# Expose port (Railway sets this automatically)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
