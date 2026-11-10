import type { HealthResponse } from 'api-contracts';
import { IMPLEMENTED_ENDPOINTS } from '../../endpoints';
import type { MockRouteMap } from './types';

export function createHealthMockRoutes(): MockRouteMap {
  return {
    [`GET ${IMPLEMENTED_ENDPOINTS.HEALTH}`]: (): HealthResponse => ({
      status: 'ok',
      uptimeSeconds: 42,
      timestamp: new Date().toISOString(),
      database: { status: 'up', latencyMs: 2 },
    }),
  };
}
