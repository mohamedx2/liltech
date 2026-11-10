import type { ApiRequestConfig } from '../../transport';

export type MockRouteHandler = (config: ApiRequestConfig) => unknown;

export type MockRouteMap = Record<string, MockRouteHandler>;
