FROM node:18

WORKDIR /app

COPY server ./server
WORKDIR /app/server

RUN npm install express
RUN chmod +x ffmpeg-loop.sh

CMD ["sh", "-c", "./ffmpeg-loop.sh & node server.js"]