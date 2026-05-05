const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set('trust proxy', true);
app.use(express.static(path.join(__dirname, 'public')));

let globalBlackout = false;
let globalVideoPlaying = false;
let globalVideoStartTime = null;  // ← nou: momentul când a început video-ul (ms)

const clients = {
  projectors: new Set(),
  clients: new Set(),
  admins: new Set()
};

const getClientUrl = (req) => {
  const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}/client`;
};

app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/', (req, res) => res.redirect('/projector'));
app.get('/projector', (req, res) => res.sendFile(path.join(__dirname, 'public', 'projector.html')));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/api/qr-data', (req, res) => res.json({ url: getClientUrl(req) }));
app.get('/api/qr-code', async (req, res) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(getClientUrl(req), {
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    res.json({ qrDataUrl });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'qr_generation_failed' });
  }
});
app.get('/api/config', (_req, res) => {
  res.json({
    videoUrl: process.env.VIDEO_URL || '/0501.mp4'
  });
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  socket.data.role = null;

  socket.on('register', (type) => {
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
    clients.admins.delete(socket);

    socket.data.role = type;

    if (type === 'projector') {
      clients.projectors.add(socket);
      const elapsed = globalVideoStartTime ? (Date.now() - globalVideoStartTime) / 1000 : 0;
      socket.emit('sync-state', { 
        blackout: globalBlackout, 
        videoPlaying: globalVideoPlaying,
        videoTime: elapsed
      });
      if (globalVideoPlaying) socket.emit('play-video', { time: elapsed });
    } else if (type === 'client') {
      clients.clients.add(socket);
      const elapsed = globalVideoStartTime ? (Date.now() - globalVideoStartTime) / 1000 : 0;
      socket.emit('sync-state', { 
        blackout: globalBlackout, 
        videoPlaying: globalVideoPlaying,
        videoTime: elapsed
      });
      if (globalVideoPlaying) socket.emit('play-video', { time: elapsed });
    } else if (type === 'admin') {
      clients.admins.add(socket);
    }
    console.log(`Projectors: ${clients.projectors.size}, Clients: ${clients.clients.size}`);
  });

  socket.on('start-sequence', () => {
    if (socket.data.role !== 'admin') {
      console.warn(`Unauthorized start-sequence from ${socket.id}`);
      return;
    }
    console.log('START SEQUENCE');
    const targets = [...clients.projectors, ...clients.clients];
    targets.forEach(c => c.emit('blackout'));
    globalBlackout = true;
    globalVideoPlaying = false;
    globalVideoStartTime = null;

    setTimeout(() => {
      globalVideoStartTime = Date.now();
      globalVideoPlaying = true;
      const elapsed = 0;
      targets.forEach(c => c.emit('play-video', { time: elapsed }));
    }, 2000);
  });

  socket.on('restart', () => {
    if (socket.data.role !== 'admin') {
      console.warn(`Unauthorized restart from ${socket.id}`);
      return;
    }
    console.log('RESTART');
    globalBlackout = false;
    globalVideoPlaying = false;
    globalVideoStartTime = null;
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