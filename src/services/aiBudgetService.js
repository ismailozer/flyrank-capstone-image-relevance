const {
  getTenantEstimatedSpend,
} = require(
  "../repositories/aiCallRepository"
);

const {
  getTenantById,
} = require(
  "../repositories/tenantRepository"
);


class AiBudgetExceededError
  extends Error {
  constructor({
    tenantId,
    currentSpend,
    estimatedNextCostUsd,
    budget,
  }) {
    const projectedSpend =
      currentSpend +
      estimatedNextCostUsd;

    super(
      `AI budget exceeded for tenant ${tenantId}. ` +
        `Current estimated spend: $${currentSpend.toFixed(
          8
        )}, ` +
        `estimated next cost: $${estimatedNextCostUsd.toFixed(
          8
        )}, ` +
        `projected spend: $${projectedSpend.toFixed(
          8
        )}, ` +
        `budget: $${budget.toFixed(
          8
        )}.`
    );

    this.name =
      "AiBudgetExceededError";

    this.code =
      "AI_BUDGET_EXCEEDED";

    this.tenantId =
      tenantId;

    this.currentSpend =
      currentSpend;

    this.estimatedNextCostUsd =
      estimatedNextCostUsd;

    this.projectedSpend =
      projectedSpend;

    this.budget =
      budget;
  }
}


async function getTenantBudgetSnapshot(
  tenantId
) {
  const tenant =
    await getTenantById(
      tenantId
    );

  if (!tenant) {
    throw new Error(
      `Tenant ${tenantId} does not exist.`
    );
  }

  const budget = Number(
    tenant.ai_budget_usd
  );

  if (
    !Number.isFinite(budget) ||
    budget < 0
  ) {
    throw new Error(
      `Tenant ${tenantId} has an invalid AI budget.`
    );
  }

  const currentSpend =
    await getTenantEstimatedSpend(
      tenantId
    );

  return {
    tenantId,
    currentSpend,
    budget,
    remainingBudget:
      Math.max(
        0,
        budget -
          currentSpend
      ),
  };
}


async function assertAiBudgetAvailable({
  tenantId,
  estimatedNextCostUsd = 0,
}) {
  if (
    !Number.isFinite(
      estimatedNextCostUsd
    ) ||
    estimatedNextCostUsd < 0
  ) {
    throw new Error(
      "estimatedNextCostUsd must be a non-negative number."
    );
  }

  const snapshot =
    await getTenantBudgetSnapshot(
      tenantId
    );

  const projectedSpend =
    snapshot.currentSpend +
    estimatedNextCostUsd;

  /*
   * Equality matters here.
   *
   * If current spend has already reached
   * the configured budget, no additional
   * provider call may begin.
   */
  if (
    snapshot.currentSpend >=
      snapshot.budget ||
    projectedSpend >
      snapshot.budget
  ) {
    throw new AiBudgetExceededError({
      tenantId,

      currentSpend:
        snapshot.currentSpend,

      estimatedNextCostUsd,

      budget:
        snapshot.budget,
    });
  }

  return {
    ...snapshot,
    estimatedNextCostUsd,
    projectedSpend,
  };
}


module.exports = {
  AiBudgetExceededError,
  getTenantBudgetSnapshot,
  assertAiBudgetAvailable,
};