const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

let isBlackout = false;
let isVideoPlaying = false;

const clients = {
  projectors: new Set(),
  clients: new Set()
};

app.get('/', (req, res) => res.redirect('/projector'));
app.get('/projector', (req, res) => res.sendFile(path.join(__dirname, 'public', 'projector.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/api/qr-data', (req, res) => {
  const host = req.get('host');
  res.json({ url: `${req.protocol}://${host}/client` });
});

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('register', (type) => {
    if (type === 'projector') {
      clients.projectors.add(socket);
      socket.emit('state', { blackout: isBlackout, videoPlaying: isVideoPlaying });
    } else if (type === 'client') {
      clients.clients.add(socket);
      socket.emit('state', { blackout: isBlackout, videoPlaying: isVideoPlaying });
    }
    console.log(`Projectors: ${clients.projectors.size}, Clients: ${clients.clients.size}`);
  });

  socket.on('start', () => {
    console.log('START triggered');
    const all = [...clients.projectors, ...clients.clients];
    
    // Blackout
    all.forEach(c => c.emit('blackout'));
    isBlackout = true;
    isVideoPlaying = false;
    
    // Video after 2 seconds
    setTimeout(() => {
      all.forEach(c => c.emit('play-video'));
      isVideoPlaying = true;
    }, 2000);
  });

  socket.on('restart', () => {
    console.log('RESTART');
    isBlackout = false;
    isVideoPlaying = false;
    const all = [...clients.projectors, ...clients.clients];
    all.forEach(c => c.emit('restart'));
  });

  socket.on('disconnect', () => {
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
  });
});

server.listen(3000, () => console.log('Server running on port 3000'));
