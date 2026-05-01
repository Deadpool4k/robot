const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients by type
const clients = {
  projectors: new Set(),
  clients: new Set(),
  admins: new Set()
};

// Generate QR code data (URL to /client)
const getClientUrl = (req) => {
  const host = req.get('host');
  const protocol = req.protocol;
  return `${protocol}://${host}/client`;
};

// Routes
app.get('/', (req, res) => {
  res.redirect('/projector');
});

app.get('/projector', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'projector.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API endpoint to get QR code data
app.get('/api/qr-data', (req, res) => {
  res.json({ url: getClientUrl(req) });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Register client type
  socket.on('register', (type) => {
    console.log(`Registered as: ${type}`);
    
    // Remove from all sets first
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
    clients.admins.delete(socket);
    
    // Add to appropriate set
    if (type === 'projector') {
      clients.projectors.add(socket);
      // Send current state to newly connected projector
      socket.emit('game-state', { isBlackout: globalBlackout });
    } else if (type === 'client') {
      clients.clients.add(socket);
      socket.emit('game-state', { isBlackout: globalBlackout });
    } else if (type === 'admin') {
      clients.admins.add(socket);
    }
    
    console.log(`Counts - Projectors: ${clients.projectors.size}, Clients: ${clients.clients.size}, Admins: ${clients.admins.size}`);
  });
  
  // Handle start sequence from admin
  socket.on('start-sequence', () => {
    console.log('START SEQUENCE initiated!');
    
    // Broadcast to all projectors and clients
    const targets = [...clients.projectors, ...clients.clients];
    
    // Step 1: Blackout instantly
    targets.forEach(client => {
      client.emit('blackout');
    });
    
    globalBlackout = true;
    
    // Step 2: After 2 seconds, play video
    setTimeout(() => {
      console.log('Playing video on all screens');
      targets.forEach(client => {
        client.emit('play-video');
      });
    }, 2000);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    clients.projectors.delete(socket);
    clients.clients.delete(socket);
    clients.admins.delete(socket);
    console.log('Disconnected:', socket.id);
  });
});

let globalBlackout = false;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});