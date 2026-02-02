const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  try {
    let filePath = req.url === '/' ? '/public/index.html' : req.url;
    
    // Remove query parameters
    const urlWithoutQuery = filePath.split('?')[0];
    
    // Handle special cases
    if (urlWithoutQuery === '/favicon.ico') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    
    // Handle Chrome DevTools requests
    if (urlWithoutQuery.includes('.well-known')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    
    // Route file requests
    if (urlWithoutQuery.startsWith('/dist/')) {
      filePath = urlWithoutQuery; // Keep as is for dist files
      // Add .js extension if missing for ES modules
      if (!path.extname(filePath)) {
        filePath += '.js';
      }
    } else if (urlWithoutQuery.startsWith('/public/')) {
      filePath = urlWithoutQuery; // Keep as is for public files
    } else {
      filePath = '/public' + urlWithoutQuery; // Add public prefix for other files
    }
    
    const fullPath = path.join(__dirname, filePath);
    console.log(`Serving file: ${fullPath}`);
    
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (err, content) => {
      if (err) {
        console.error(`Error reading file ${fullPath}:`, err.message);
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 - File Not Found</h1>');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>500 - Internal Server Error</h1>');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>500 - Internal Server Error</h1>');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Domain Availability Checker running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${__dirname}`);
  console.log(`🔍 Open your browser and navigate to http://localhost:${PORT}`);
});