FROM node:22-slim

# Install system dependencies (openssl is required by Prisma engines)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package configuration
COPY package*.json ./

# Install dependencies (using npm install because we want to resolve version trees correctly)
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application files
COPY . .

# Set environment defaults
ENV PORT=4000
ENV NODE_ENV=production

# Expose port 4000
EXPOSE 4000

# Start backend server
CMD ["npm", "start"]
