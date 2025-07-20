# Use Node.js base image
FROM node:18

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set working directory
WORKDIR /app

# Copy package.json files first (for better caching)
COPY server/package*.json ./server/

# Install server dependencies
WORKDIR /app/server
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Create necessary directories for streams
RUN mkdir -p ./server/public/streams
RUN mkdir -p ./server/public/segments

# Ensure video directory exists
RUN mkdir -p ./server/video

# Expose the port (Render will override with its own PORT env variable)
EXPOSE 8000

# Set working directory to server for running the app
WORKDIR /app/server

# Start the server directly
CMD ["node", "server.js"]