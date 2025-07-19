# Use Node.js 20 base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Expose port (not used but required by Railway)
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]
