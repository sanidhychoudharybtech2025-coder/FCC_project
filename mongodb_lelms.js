use lelms_telemetry_db

// 1. Create Indexes
db.equipment_units.createIndex({ asset_tag: 1 }, { unique: true });
db.issue_records.createIndex({ issue_id: 1 }, { unique: true });
db.work_orders.createIndex({ wo_id: 1 }, { unique: true });

// 2. Aggregation Pipeline: Total Maintenance Cost & Work Order Count by Type
print("--- Work Order Cost Aggregation by Type ---");
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

// 3. Aggregation Pipeline: Equipment Count & Total Usage Hours per Laboratory
print("--- Equipment Utilization by Laboratory ---");
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
