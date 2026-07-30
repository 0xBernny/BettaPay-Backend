import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { buildApp, AppOptions } from './index.js';

export interface MockData {
  payments?: any[];
  merchants?: any[];
  settlements?: any[];
  auditLogs?: any[];
}

export function createMockPrisma(initialData: MockData = {}) {
  const store = {
    payments: [...(initialData.payments || [])],
    merchants: [...(initialData.merchants || [])],
    settlements: [...(initialData.settlements || [])],
    auditLogs: [...(initialData.auditLogs || [])],
  };

  const mockPayment = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.payments.find((p) => p.id === where.id) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      return (
        store.payments.find((p) => {
          if (where.id && p.id !== where.id) return false;
          if (where.idempotencyKey && p.idempotencyKey !== where.idempotencyKey) return false;
          if (where.idempotencyKeyExpiresAt?.gt && p.idempotencyKeyExpiresAt && new Date(p.idempotencyKeyExpiresAt) <= where.idempotencyKeyExpiresAt.gt) return false;
          return true;
        }) || null
      );
    },
    findMany: async ({ where }: { where?: any } = {}) => {
      if (!where) return [...store.payments];
      return store.payments.filter((p) => {
        if (where.merchantId && p.merchantId !== where.merchantId) return false;
        return true;
      });
    },
    create: async ({ data }: { data: any }) => {
      const created = {
        id: data.id || 'pay_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'initiated',
        ...data,
      };
      store.payments.push(created);
      return created;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const index = store.payments.findIndex((p) => p.id === where.id);
      if (index === -1) {
        throw new Error(`Record to update not found: payment ${where.id}`);
      }
      const updated = {
        ...store.payments[index],
        ...data,
        updatedAt: new Date(),
      };
      store.payments[index] = updated;
      return updated;
    },
  };

  const mockMerchant = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.merchants.find((m) => m.id === where.id) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      return (
        store.merchants.find((m) => {
          if (where.id && m.id !== where.id) return false;
          if (where.deletedAt === null && m.deletedAt !== null && m.deletedAt !== undefined) return false;
          return true;
        }) || null
      );
    },
    findMany: async ({ where }: { where?: any } = {}) => {
      return [...store.merchants];
    },
    create: async ({ data }: { data: any }) => {
      const created = {
        id: data.id || 'm_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        status: 'active',
        settings: {},
        ...data,
      };
      store.merchants.push(created);
      return created;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const index = store.merchants.findIndex((m) => m.id === where.id);
      if (index === -1) {
        throw new Error(`Record to update not found: merchant ${where.id}`);
      }
      const updated = {
        ...store.merchants[index],
        ...data,
        updatedAt: new Date(),
      };
      store.merchants[index] = updated;
      return updated;
    },
  };

  function filterSettlements(where: any = {}) {
    let result = [...store.settlements];
    if (where?.merchantId) {
      result = result.filter((s) => s.merchantId === where.merchantId);
    }
    if (where?.status) {
      result = result.filter((s) => s.status === where.status);
    }
    if (where?.initiatedAt?.gte) {
      const gte = new Date(where.initiatedAt.gte);
      result = result.filter((s) => new Date(s.initiatedAt) >= gte);
    }
    if (where?.initiatedAt?.lte) {
      const lte = new Date(where.initiatedAt.lte);
      result = result.filter((s) => new Date(s.initiatedAt) <= lte);
    }
    return result;
  }

  const mockSettlement = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.settlements.find((s) => s.id === where.id) || null;
    },
    findFirst: async ({ where }: { where: any }) => {
      return store.settlements.find((s) => s.id === where.id) || null;
    },
    findMany: async ({ where, take, skip }: { where?: any; take?: number; skip?: number } = {}) => {
      const result = filterSettlements(where).sort(
        (a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime()
      );
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      return result.slice(start, end);
    },
    count: async ({ where }: { where?: any } = {}) => {
      return filterSettlements(where).length;
    },
    create: async ({ data }: { data: any }) => {
      const created = {
        id: data.id || 'set_' + Math.random().toString(36).substring(2, 9),
        initiatedAt: new Date(),
        status: 'PENDING',
        completedAt: null,
        ...data,
      };
      store.settlements.push(created);
      return created;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const index = store.settlements.findIndex((s) => s.id === where.id);
      if (index === -1) {
        throw new Error(`Record to update not found: settlement ${where.id}`);
      }
      const updated = {
        ...store.settlements[index],
        ...data,
      };
      store.settlements[index] = updated;
      return updated;
    },
  };

  const mockAuditLog = {
    findMany: async ({ where, take, skip }: { where?: any; take?: number; skip?: number } = {}) => {
      let result = [...store.auditLogs];
      if (where?.entityType) result = result.filter((a) => a.entityType === where.entityType);
      if (where?.action) result = result.filter((a) => a.action === where.action);
      const start = skip || 0;
      const end = take ? start + take : undefined;
      return result.slice(start, end);
    },
    count: async ({ where }: { where?: any } = {}) => {
      let result = [...store.auditLogs];
      if (where?.entityType) result = result.filter((a) => a.entityType === where.entityType);
      if (where?.action) result = result.filter((a) => a.action === where.action);
      return result.length;
    },
    create: async ({ data }: { data: any }) => {
      const created = { id: 'audit_' + Math.random().toString(36).substring(2, 9), createdAt: new Date(), ...data };
      store.auditLogs.push(created);
      return created;
    },
  };

  const mockPrismaInstance = {
    store,
    payment: mockPayment,
    merchant: mockMerchant,
    settlement: mockSettlement,
    auditLog: mockAuditLog,
    $transaction: async (cb: (tx: any) => Promise<any>) => {
      return cb(mockPrismaInstance);
    },
    $queryRaw: async () => [{ '?column?': 1 }],
    $connect: async () => {},
    $disconnect: async () => {},
  };

  return mockPrismaInstance;
}

export function generateTestJwt(
  app: FastifyInstance,
  payload: object = { merchantId: 'm1', ownerId: 'u1' }
): string {
  return app.jwt.sign(payload);
}

export function createTestApp(
  overrides: Partial<AppOptions> = {},
  initialData: MockData = {}
) {
  const mockPrisma = overrides.prisma || (createMockPrisma(initialData) as any);
  const app = buildApp({
    prisma: mockPrisma,
    logger: false,
    ...overrides,
  });
  return { app, mockPrisma };
}
