const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

app.use('/hls', express.static(path.join(__dirname, 'hls')));
app.use('/video', express.static(path.join(__dirname, 'video')));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});