// Core enums
export { AvailabilityStatus } from './AvailabilityStatus';

// Core interfaces
export type { IDomainResult, IDomainPricing } from './IDomainResult';
export type { IQueryRequest } from './IQueryRequest';
export type { IQueryResponse } from './IQueryResponse';
export type { IQueryError } from './IQueryError';

// Utility types and constants
export { SUPPORTED_TLDS } from './types';
export type { SupportedTLD, CheckMethod, QueryErrorType, IQueryConfig } from './types';

// Design pattern interfaces
export * from '../patterns';

// Controller interfaces
export type { IDomainController, IUICallbacks, IDomainControllerConfig, IControllerStatistics, IValidationResult, IValidationError } from '../controllers/IDomainController';