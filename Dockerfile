# Use Node.js base image
FROM node:18

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set working directory
WORKDIR /app

# Copy package.json files for both client and server
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies for both client and server
WORKDIR /app/client
RUN npm install

WORKDIR /app/server
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Build the React app
WORKDIR /app/client
# Set production environment for React build
ENV NODE_ENV=production
# Build React app
RUN npm run build

# Create necessary directories for streams
WORKDIR /app/server
RUN mkdir -p ./public/streams
RUN mkdir -p ./public/segments

# Ensure video directory exists
RUN mkdir -p ./video

# Create a default video file if none exists (using ffmpeg)
RUN if [ ! -f ./video/Sloths.mp4 ]; then \
      ffmpeg -f lavfi -i color=c=blue:s=1280x720:d=60 -t 60 ./video/Sloths.mp4; \
    fi

# Expose the port (Render will override with its own PORT env variable)
EXPOSE 8000

# Set working directory to server for running the app
WORKDIR /app/server

# Start the server
CMD ["node", "server.js"]