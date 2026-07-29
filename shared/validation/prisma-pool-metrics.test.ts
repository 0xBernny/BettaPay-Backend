import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerPrismaPoolMetrics,
  updatePrismaPoolMetrics,
  startPrismaPoolMetricsCollector,
} from './prisma-pool-metrics.js';

function createMockGauge() {
  let val = 0;
  return {
    set: (v: number) => { val = v; },
    getVal: () => val,
  };
}

function createMockRegistry() {
  const metrics: Record<string, any> = {};
  return {
    metricsStore: metrics,
    getSingleMetric: (name: string) => metrics[name] || null,
    Gauge: function GaugeMock(opts: { name: string; help: string }) {
      const g = createMockGauge();
      metrics[opts.name] = g;
      return g;
    },
  };
}

test('registerPrismaPoolMetrics: registers prisma_pool gauges without duplication', () => {
  const registry = createMockRegistry();
  const metrics1 = registerPrismaPoolMetrics(registry);
  const metrics2 = registerPrismaPoolMetrics(registry);

  assert.equal(metrics1?.usedGauge, metrics2?.usedGauge);
  assert.equal(metrics1?.idleGauge, metrics2?.idleGauge);
  assert.equal(metrics1?.waitingGauge, metrics2?.waitingGauge);
});

test('updatePrismaPoolMetrics: updates gauge values from pool statistics', () => {
  const registry = createMockRegistry();
  const mockPool = {
    totalCount: 10,
    idleCount: 7,
    waitingCount: 2,
  };

  updatePrismaPoolMetrics(mockPool, registry);

  assert.equal(registry.metricsStore['prisma_pool_used'].getVal(), 3);
  assert.equal(registry.metricsStore['prisma_pool_idle'].getVal(), 7);
  assert.equal(registry.metricsStore['prisma_pool_waiting'].getVal(), 2);
});

test('startPrismaPoolMetricsCollector: starts periodic updates and handles stop() cleanly', async () => {
  const registry = createMockRegistry();
  let poolStats = { totalCount: 5, idleCount: 5, waitingCount: 0 };

  const collector = startPrismaPoolMetricsCollector(() => poolStats, registry, 50);

  assert.equal(registry.metricsStore['prisma_pool_used'].getVal(), 0);

  poolStats = { totalCount: 5, idleCount: 2, waitingCount: 1 };

  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(registry.metricsStore['prisma_pool_used'].getVal(), 3);
  assert.equal(registry.metricsStore['prisma_pool_idle'].getVal(), 2);
  assert.equal(registry.metricsStore['prisma_pool_waiting'].getVal(), 1);

  collector.stop();
});

test('updatePrismaPoolMetrics: handles failing pool getter gracefully without throwing', () => {
  const registry = createMockRegistry();
  let warnCalled = false;

  const logger = {
    warn: () => {
      warnCalled = true;
    },
  };

  const failingGetter = () => {
    throw new Error('Database pool unavailable');
  };

  assert.doesNotThrow(() => {
    updatePrismaPoolMetrics(failingGetter, registry, logger);
  });

  assert.equal(warnCalled, true, 'Logger warning should be emitted on error');
});
