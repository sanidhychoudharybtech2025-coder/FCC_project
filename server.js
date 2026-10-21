const http = require('http');
const fs = require('fs');
const url = require('url');
const EventEmitter = require('events');

class MaintenanceEventBus extends EventEmitter {}
const maintenanceBus = new MaintenanceEventBus();

// Event Listener: Log critical corrective work orders to local file & trigger email alert
maintenanceBus.on('workOrderCreated', (wo) => {
  const entry = `${new Date().toISOString()} | WO#${wo.wo_id} | Unit:${wo.asset_tag} | Type:${wo.wo_type}\n`;
  fs.appendFile('maintenance_audit.log', entry, (err) => {
    if (err) console.error('FS Log Error:', err);
  });
});

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === 'GET' && parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'LELMS-Node-API', status: 'ONLINE' }));
  } else if (req.method === 'POST' && parsedUrl.pathname === '/api/work-order') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      maintenanceBus.emit('workOrderCreated', payload);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Work order logged and alert dispatched.' }));
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  }
});

server.listen(process.env.PORT || 4000);