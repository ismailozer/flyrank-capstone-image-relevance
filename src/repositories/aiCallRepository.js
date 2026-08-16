const pool = require("../db/pool");

async function createAiCall({
  tenantId,
  operation,
  entityType,
  entityId,
  provider,
  model,
  inputUnits = 0,
  outputUnits = 0,
  estimatedCostUsd = 0,
  latencyMs = null,
  status,
  errorMessage = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO ai_calls (
        tenant_id,
        operation,
        entity_type,
        entity_id,
        provider,
        model,
        input_units,
        output_units,
        estimated_cost_usd,
        latency_ms,
        status,
        error_message
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12
      )
      RETURNING *
    `,
    [
      tenantId,
      operation,
      entityType,
      entityId,
      provider,
      model,
      inputUnits,
      outputUnits,
      estimatedCostUsd,
      latencyMs,
      status,
      errorMessage,
    ]
  );

  return result.rows[0];
}

async function getTenantEstimatedSpend(
  tenantId
) {
  const result = await pool.query(
    `
      SELECT
        COALESCE(
          SUM(estimated_cost_usd),
          0
        ) AS total_cost
      FROM ai_calls
      WHERE tenant_id = $1
        AND status = 'success'
    `,
    [tenantId]
  );

  return Number(
    result.rows[0].total_cost
  );
}

module.exports = {
  createAiCall,
  getTenantEstimatedSpend,
};