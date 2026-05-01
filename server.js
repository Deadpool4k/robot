const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

let globalBlackout = false;
let globalVideoPlaying = false;
let globalVideoTime = 0; // Stochează timpul curent al videoclipului
let videoStartTime = null; // Momentul când a început videoclipul (server)

const clients = {
  projectors: new Set(),
  clients: new Set(),
  admins: new Set()
};

const getClientUrl = (req) => {
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}/client`;
};

app.get('/', (req, res) => res.redirect('/projector'));
app.get('/projector', (req, res) => res.sendFile(path.join(__dirname, 'public', 'projector.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/api/qr-data', (req, res) => res.json({ url: getClientUrl(req) }));

// Actualizează timpul videoclipului (clientul trimite periodic)
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('register', (type) => {
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
    clients.admins.delete(socket);

    if (type === 'projector') {
      clients.projectors.add(socket);
      socket.emit('sync-state', { 
        blackout: globalBlackout, 
        videoPlaying: globalVideoPlaying,
        videoTime: globalVideoTime
      });
      if (globalVideoPlaying) socket.emit('play-video', { time: globalVideoTime });
    } else if (type === 'client') {
      clients.clients.add(socket);
      socket.emit('sync-state', { 
        blackout: globalBlackout, 
        videoPlaying: globalVideoPlaying,
        videoTime: globalVideoTime
      });
      if (globalVideoPlaying) socket.emit('play-video', { time: globalVideoTime });
    } else if (type === 'admin') {
      clients.admins.add(socket);
    }

    console.log(`Projectors: ${clients.projectors.size}, Clients: ${clients.clients.size}`);
  });

  // Clientul raportează timpul curent al videoclipului
  socket.on('video-time', (time) => {
    if (globalVideoPlaying) {
      globalVideoTime = time;
    }
  });

  socket.on('start-sequence', () => {
    console.log('START SEQUENCE');
    const targets = [...clients.projectors, ...clients.clients];
    targets.forEach(c => c.emit('blackout'));
    globalBlackout = true;
    globalVideoPlaying = false;
    globalVideoTime = 0;
    videoStartTime = null;

    setTimeout(() => {
      videoStartTime = Date.now();
      globalVideoPlaying = true;
      globalVideoTime = 0;
      targets.forEach(c => c.emit('play-video', { time: 0 }));
    }, 2000);
  });

  socket.on('restart', () => {
    console.log('RESTART');
    globalBlackout = false;
    globalVideoPlaying = false;
    globalVideoTime = 0;
    videoStartTime = null;

    const all = [...clients.projectors, ...clients.clients];
    all.forEach(c => c.emit('restart'));
  });

  socket.on('disconnect', () => {
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
    clients.admins.delete(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server pe port ${PORT}`));
