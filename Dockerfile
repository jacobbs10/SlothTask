# Use Node.js base image
FROM node:18

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set working directory
WORKDIR /app

# Copy everything into the container
COPY . .

# Install dependencies (assumes package.json is in /server)
WORKDIR /app/server
RUN npm install

# Make start script executable
RUN chmod +x start.sh

# Start the app
CMD ["./start.sh"]