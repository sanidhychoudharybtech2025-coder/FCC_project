const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const EventEmitter = require('events');

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'lelms_telemetry_db';

class LelmsEventBus extends EventEmitter {}
const eventBus = new LelmsEventBus();

// Unit 3: Event-driven file logging & automated alert trace
eventBus.on('auditEvent', (action, details) => {
  const line = `${new Date().toISOString()} | ${action} | ${JSON.stringify(details)}\n`;
  fs.appendFile(path.join(__dirname, 'maintenance_audit.log'), line, () => {});
});

function getDefaultSeedState() {
  return {
    storageMode: 'MongoDB Connected (lelms_telemetry_db)',
    inventory: [
      { asset_tag: 'AST-ECE-001', serial_no: 'SN-KEY-9901A', model_name: 'InfiniiVision DSOX3024T', lab_name: 'RF & Signal Processing Lab', total_usage_hours: 480.5, status: 'available' },
      { asset_tag: 'AST-ECE-002', serial_no: 'SN-KEY-9901B', model_name: 'InfiniiVision DSOX3024T', lab_name: 'Embedded Systems Lab', total_usage_hours: 615.0, status: 'issued' },
      { asset_tag: 'AST-MECH-001', serial_no: 'SN-INS-5967A', model_name: 'Instron 5967 Dual Column UTM', lab_name: 'Strength of Materials Lab', total_usage_hours: 940.0, status: 'under maintenance' },
      { asset_tag: 'AST-BIO-001', serial_no: 'SN-THM-ND01A', model_name: 'NanoDrop OneC UV-Vis', lab_name: 'Molecular Genomics Lab', total_usage_hours: 320.0, status: 'available' }
    ],
    issues: [
      { issue_id: 'ISS-101', asset_tag: 'AST-ECE-001', borrower_name: 'Aarav Sharma', borrower_email: 'aarav.s@student.inst.edu', expected_return_date: '2026-10-22', purpose: '5G antenna return-loss measurement', stage: 3, status_label: 'Returned (100%)' },
      { issue_id: 'ISS-102', asset_tag: 'AST-ECE-002', borrower_name: 'Priya Verma', borrower_email: 'priya.v@student.inst.edu', expected_return_date: '2026-10-25', purpose: 'MOSFET switching transient test', stage: 2, status_label: 'In Use / Issued (66%)' }
    ],
    workOrders: [
      { wo_id: 'WO-501', asset_tag: 'AST-ECE-001', wo_type: 'preventive', assignee: 'Ramesh Kulkarni', service_cost: 2500, remarks: 'Routine 500-hr preventive servicing', stage: 3, wo_status: 'completed' },
      { wo_id: 'WO-502', asset_tag: 'AST-MECH-001', wo_type: 'corrective', assignee: 'Anita Deshmukh', service_cost: 15000, remarks: 'Replace 50kN load-cell protection fuse', stage: 2, wo_status: 'in progress' }
    ]
  };
}

let state = getDefaultSeedState();
let mongoDb = null;

// Connect to MongoDB (Unit 4) if driver & mongod are present
async function initMongo() {
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    mongoDb = client.db(DB_NAME);

    const invCount = await mongoDb.collection('equipment_units').countDocuments();
    if (invCount === 0) {
      const seed = getDefaultSeedState();
      await mongoDb.collection('equipment_units').insertMany(seed.inventory);
      await mongoDb.collection('issue_records').insertMany(seed.issues);
      await mongoDb.collection('work_orders').insertMany(seed.workOrders);
    }
    console.log(`Connected to MongoDB database: ${DB_NAME}`);
  } catch (err) {
    state.storageMode = 'Node.js File/Memory Store (Start mongod for MongoDB)';
    console.log('MongoDB daemon not detected; using Node.js active store fallback.');
  }
}

async function getCurrentState() {
  if (!mongoDb) return state;
  const inventory = await mongoDb.collection('equipment_units').find({}, { projection: { _id: 0 } }).toArray();
  const issues = await mongoDb.collection('issue_records').find({}, { projection: { _id: 0 } }).toArray();
  const workOrders = await mongoDb.collection('work_orders').find({}, { projection: { _id: 0 } }).toArray();
  return {
    storageMode: `MongoDB Connected (${DB_NAME})`,
    inventory,
    issues,
    workOrders
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 200, {});
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Serve index.html and styles.css
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }
  if (req.method === 'GET' && pathname === '/styles.css') {
    const css = fs.readFileSync(path.join(__dirname, 'styles.css'));
    res.writeHead(200, { 'Content-Type': 'text/css' });
    return res.end(css);
  }

  // API: Get Full State
  if (req.method === 'GET' && pathname === '/api/state') {
    return sendJson(res, 200, await getCurrentState());
  }

  // API: Add Inventory Unit
  if (req.method === 'POST' && pathname === '/api/inventory') {
    const unit = await parseBody(req);
    if (mongoDb) await mongoDb.collection('equipment_units').insertOne({ ...unit });
    else state.inventory.push(unit);
    eventBus.emit('auditEvent', 'ADD_UNIT', unit);
    return sendJson(res, 201, await getCurrentState());
  }

  // API: Create Issue Request
  if (req.method === 'POST' && pathname === '/api/issues') {
    const issue = await parseBody(req);
    if (mongoDb) await mongoDb.collection('issue_records').insertOne({ ...issue });
    else state.issues.unshift(issue);
    eventBus.emit('auditEvent', 'CREATE_ISSUE', issue);
    return sendJson(res, 201, await getCurrentState());
  }

  // API: Create Work Order
  if (req.method === 'POST' && pathname === '/api/workorders') {
    const wo = await parseBody(req);
    if (mongoDb) {
      await mongoDb.collection('work_orders').insertOne({ ...wo });
      await mongoDb.collection('equipment_units').updateOne(
        { asset_tag: wo.asset_tag },
        { $set: { status: 'under maintenance' } }
      );
    } else {
      state.workOrders.unshift(wo);
      const u = state.inventory.find(x => x.asset_tag === wo.asset_tag);
      if (u) u.status = 'under maintenance';
    }
    eventBus.emit('auditEvent', 'CREATE_WORK_ORDER', wo);
    return sendJson(res, 201, await getCurrentState());
  }

  // API: Advance Progress Stage (Stage 1 -> 2 -> 3)
  if (req.method === 'POST' && pathname === '/api/advance') {
    const { collection, id } = await parseBody(req);
    if (mongoDb) {
      if (collection === 'issues') {
        const item = await mongoDb.collection('issue_records').findOne({ issue_id: id });
        if (item && item.stage < 3) {
          const nextStage = item.stage + 1;
          await mongoDb.collection('issue_records').updateOne({ issue_id: id }, { $set: { stage: nextStage } });
          await mongoDb.collection('equipment_units').updateOne(
            { asset_tag: item.asset_tag },
            { $set: { status: nextStage === 2 ? 'issued' : 'available' } }
          );
        }
      } else if (collection === 'workorders') {
        const wo = await mongoDb.collection('work_orders').findOne({ wo_id: id });
        if (wo && wo.stage < 3) {
          const nextStage = wo.stage + 1;
          const nextStatus = nextStage === 2 ? 'in progress' : 'completed';
          await mongoDb.collection('work_orders').updateOne({ wo_id: id }, { $set: { stage: nextStage, wo_status: nextStatus } });
          await mongoDb.collection('equipment_units').updateOne(
            { asset_tag: wo.asset_tag },
            { $set: { status: nextStage === 2 ? 'under maintenance' : 'available' } }
          );
        }
      }
    } else {
      if (collection === 'issues') {
        const item = state.issues.find(i => i.issue_id === id);
        if (item && item.stage < 3) {
          item.stage += 1;
          const u = state.inventory.find(x => x.asset_tag === item.asset_tag);
          if (u) u.status = item.stage === 2 ? 'issued' : 'available';
        }
      } else if (collection === 'workorders') {
        const wo = state.workOrders.find(w => w.wo_id === id);
        if (wo && wo.stage < 3) {
          wo.stage += 1;
          wo.wo_status = wo.stage === 2 ? 'in progress' : 'completed';
          const u = state.inventory.find(x => x.asset_tag === wo.asset_tag);
          if (u) u.status = wo.stage === 2 ? 'under maintenance' : 'available';
        }
      }
    }
    eventBus.emit('auditEvent', 'ADVANCE_STAGE', { collection, id });
    return sendJson(res, 200, await getCurrentState());
  }

  // API: Admin Delete Single Record
  if (req.method === 'POST' && pathname === '/api/admin/delete') {
    const { collection, id } = await parseBody(req);
    if (mongoDb) {
      if (collection === 'inventory') await mongoDb.collection('equipment_units').deleteOne({ asset_tag: id });
      if (collection === 'issues') await mongoDb.collection('issue_records').deleteOne({ issue_id: id });
      if (collection === 'workorders') await mongoDb.collection('work_orders').deleteOne({ wo_id: id });
    } else {
      if (collection === 'inventory') state.inventory = state.inventory.filter(u => u.asset_tag !== id);
      if (collection === 'issues') state.issues = state.issues.filter(i => i.issue_id !== id);
      if (collection === 'workorders') state.workOrders = state.workOrders.filter(w => w.wo_id !== id);
    }
    eventBus.emit('auditEvent', 'ADMIN_DELETE', { collection, id });
    return sendJson(res, 200, await getCurrentState());
  }

  // API: Admin Clear All Requests / Work Orders
  if (req.method === 'POST' && pathname === '/api/admin/clear') {
    const { collection } = await parseBody(req);
    if (mongoDb) {
      if (collection === 'issues') await mongoDb.collection('issue_records').deleteMany({});
      if (collection === 'workorders') await mongoDb.collection('work_orders').deleteMany({});
    } else {
      if (collection === 'issues') state.issues = [];
      if (collection === 'workorders') state.workOrders = [];
    }
    eventBus.emit('auditEvent', 'ADMIN_CLEAR_ALL', { collection });
    return sendJson(res, 200, await getCurrentState());
  }

  // API: Admin Reset Seed Data
  if (req.method === 'POST' && pathname === '/api/admin/reset') {
    const seed = getDefaultSeedState();
    if (mongoDb) {
      await mongoDb.collection('equipment_units').deleteMany({});
      await mongoDb.collection('issue_records').deleteMany({});
      await mongoDb.collection('work_orders').deleteMany({});
      await mongoDb.collection('equipment_units').insertMany(seed.inventory);
      await mongoDb.collection('issue_records').insertMany(seed.issues);
      await mongoDb.collection('work_orders').insertMany(seed.workOrders);
    } else {
      state = seed;
    }
    eventBus.emit('auditEvent', 'ADMIN_RESET_SEED', {});
    return sendJson(res, 200, await getCurrentState());
  }

  sendJson(res, 404, { error: 'Not Found' });
});

initMongo().then(() => {
  server.listen(PORT, () => {
    console.log(`LELMS Full-Stack Portal running at http://localhost:${PORT}`);
  });
});