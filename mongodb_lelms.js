// ============================================================================
// UNIT 4: MONGODB CRUD, 1:1 & M:N DATA MODELING, INDEXES & AGGREGATION
// Synced with server.js database (lelms_telemetry_db)
// ============================================================================

use lelms_telemetry_db;

// 1. CLEAR EXISTING COLLECTIONS FOR CLEAN DEMO
db.equipment_units.drop();
db.issue_records.drop();
db.work_orders.drop();
db.spare_parts.drop();

// 2. CREATE INDEXES (Unit 4 Requirement: Indexes)
db.equipment_units.createIndex({ asset_tag: 1 }, { unique: true });
db.issue_records.createIndex({ issue_id: 1 }, { unique: true });
db.work_orders.createIndex({ wo_id: 1 }, { unique: true });
db.spare_parts.createIndex({ part_number: 1 }, { unique: true });

// 3. CRUD — CREATE (INSERT) WITH 1:1 AND M:N RELATIONSHIPS
//    - 1:1 Relationship: Embedded `calibration_certificate` inside equipment_units
//    - M:N Relationship: `parts_used_numbers` array linking work_orders <-> spare_parts

db.spare_parts.insertMany([
  { part_number: "SP-KEY-BNC50", part_name: "50-Ohm BNC Attenuator", stock_qty: 10, unit_cost: 4500 },
  { part_number: "SP-INS-LC50", part_name: "50kN Load Cell Fuse", stock_qty: 5, unit_cost: 12000 },
  { part_number: "SP-GEN-FAN24", part_name: "24V DC Cooling Fan", stock_qty: 12, unit_cost: 1800 }
]);

db.equipment_units.insertMany([
  {
    asset_tag: "AST-ECE-001",
    serial_no: "SN-KEY-9901A",
    model_name: "InfiniiVision DSOX3024T",
    lab_name: "RF & Signal Processing Lab",
    total_usage_hours: 480.5,
    status: "available",
    // 1:1 Relationship (Equipment Unit <-> Latest Calibration Certificate)
    calibration_certificate: {
      certificate_no: "CERT-NABL-2026-8801",
      reference_standard: "NIST Traceable RF Ref",
      result: "pass",
      valid_until: "2027-07-04"
    }
  },
  {
    asset_tag: "AST-ECE-002",
    serial_no: "SN-KEY-9901B",
    model_name: "InfiniiVision DSOX3024T",
    lab_name: "Embedded Systems Lab",
    total_usage_hours: 615.0,
    status: "issued",
    calibration_certificate: {
      certificate_no: "CERT-NABL-2026-8802",
      reference_standard: "NIST Traceable RF Ref",
      result: "pass",
      valid_until: "2027-07-04"
    }
  },
  {
    asset_tag: "AST-MECH-001",
    serial_no: "SN-INS-5967A",
    model_name: "Instron 5967 Dual Column UTM",
    lab_name: "Strength of Materials Lab",
    total_usage_hours: 940.0,
    status: "under maintenance",
    calibration_certificate: {
      certificate_no: "CERT-NABL-2026-8819",
      reference_standard: "ASTM E4 Force Standard",
      result: "adjusted",
      valid_until: "2027-08-15"
    }
  },
  {
    asset_tag: "AST-BIO-001",
    serial_no: "SN-THM-ND01A",
    model_name: "NanoDrop OneC UV-Vis",
    lab_name: "Molecular Genomics Lab",
    total_usage_hours: 320.0,
    status: "available",
    calibration_certificate: {
      certificate_no: "CERT-NABL-2026-8841",
      reference_standard: "NIST SRM 935a Potassium Dichromate",
      result: "pass",
      valid_until: "2027-09-05"
    }
  },
  {
    asset_tag: "AST-TEMP-999",
    serial_no: "SN-TMP-000",
    model_name: "Temporary Demo Unit",
    lab_name: "Embedded Systems Lab",
    total_usage_hours: 0,
    status: "decommissioned"
  }
]);

db.issue_records.insertMany([
  {
    issue_id: "ISS-101",
    asset_tag: "AST-ECE-001",
    borrower_name: "Aarav Sharma",
    borrower_email: "aarav.s@student.inst.edu",
    expected_return_date: "2026-10-22",
    purpose: "5G antenna return-loss measurement",
    stage: 3,
    status_label: "Returned (100%)"
  },
  {
    issue_id: "ISS-102",
    asset_tag: "AST-ECE-002",
    borrower_name: "Priya Verma",
    borrower_email: "priya.v@student.inst.edu",
    expected_return_date: "2026-10-25",
    purpose: "MOSFET switching transient test",
    stage: 2,
    status_label: "In Use / Issued (66%)"
  }
]);

db.work_orders.insertMany([
  {
    wo_id: "WO-501",
    asset_tag: "AST-ECE-001",
    wo_type: "preventive",
    assignee: "Ramesh Kulkarni",
    service_cost: 2500,
    remarks: "Routine 500-hr preventive servicing",
    stage: 3,
    wo_status: "completed",
    // M:N Relationship (Work Order <-> Multiple Spare Parts)
    parts_used_numbers: ["SP-KEY-BNC50", "SP-GEN-FAN24"]
  },
  {
    wo_id: "WO-502",
    asset_tag: "AST-MECH-001",
    wo_type: "corrective",
    assignee: "Anita Deshmukh",
    service_cost: 15000,
    remarks: "Replace 50kN load-cell protection fuse",
    stage: 2,
    wo_status: "in progress",
    parts_used_numbers: ["SP-INS-LC50"]
  }
]);

// 4. CRUD — READ (FIND)
print("--- AVAILABLE EQUIPMENT UNITS ---");
printjson(db.equipment_units.find({ status: "available" }, { _id: 0, asset_tag: 1, model_name: 1, lab_name: 1 }).toArray());

// 5. CRUD — UPDATE
db.equipment_units.updateOne(
  { asset_tag: "AST-ECE-001" },
  { $inc: { total_usage_hours: 5.5 } }
);

// 6. CRUD — DELETE (Remove temporary demo unit)
db.equipment_units.deleteOne({ asset_tag: "AST-TEMP-999" });

// 7. AGGREGATION PIPELINE 1: Work Order Count & Service Cost by Type
print("--- AGGREGATION 1: WORK ORDER COST BY TYPE ---");
printjson(
  db.work_orders.aggregate([
    {
      $group: {
        _id: "$wo_type",
        total_orders: { $sum: 1 },
        total_service_cost: { $sum: "$service_cost" }
      }
    },
    { $sort: { total_service_cost: -1 } }
  ]).toArray()
);

// 8. AGGREGATION PIPELINE 2: M:N $lookup Join (Work Orders <-> Spare Parts Details)
print("--- AGGREGATION 2: M:N WORK ORDER SPARE PARTS LOOKUP ---");
printjson(
  db.work_orders.aggregate([
    {
      $lookup: {
        from: "spare_parts",
        localField: "parts_used_numbers",
        foreignField: "part_number",
        as: "consumed_part_details"
      }
    },
    {
      $project: {
        _id: 0,
        wo_id: 1,
        asset_tag: 1,
        wo_type: 1,
        service_cost: 1,
        "consumed_part_details.part_number": 1,
        "consumed_part_details.part_name": 1,
        "consumed_part_details.unit_cost": 1
      }
    }
  ]).toArray()
);

// 9. AGGREGATION PIPELINE 3: Equipment Utilization by Laboratory
print("--- AGGREGATION 3: UTILIZATION BY LABORATORY ---");
printjson(
  db.equipment_units.aggregate([
    {
      $group: {
        _id: "$lab_name",
        unit_count: { $sum: 1 },
        cumulative_hours: { $sum: "$total_usage_hours" }
      }
    },
    { $sort: { cumulative_hours: -1 } }
  ]).toArray()
);