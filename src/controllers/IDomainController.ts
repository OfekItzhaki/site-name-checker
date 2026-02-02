import type { IQueryRequest, IQueryResponse, IQueryError } from '../models';

/**
 * Interface for Domain Controller - main orchestration layer
 */
export interface IDomainController {
  /**
   * Check availability for a single domain
   * @param domainName - Domain name to check
   * @returns Promise resolving to query response
   */
  checkDomain(domainName: string): Promise<IQueryResponse>;

  /**
   * Check availability for multiple domains concurrently
   * @param domainNames - Array of domain names to check
   * @returns Promise resolving to query response with all results
   */
  checkDomains(domainNames: string[]): Promise<IQueryResponse>;

  /**
   * Get current application state
   * @returns Current state information
   */
  getCurrentState(): {
    state: string;
    canTransition: boolean;
    availableTransitions: string[];
  };

  /**
   * Subscribe to state change events
   * @param callback - Function to call when state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: (event: any) => void): () => void;

  /**
   * Subscribe to domain check progress events
   * @param callback - Function to call on progress updates
   * @returns Unsubscribe function
   */
  onProgress(callback: (event: any) => void): () => void;

  /**
   * Subscribe to error events
   * @param callback - Function to call on errors
   * @returns Unsubscribe function
   */
  onError(callback: (event: any) => void): () => void;

  /**
   * Reset the controller to idle state
   */
  reset(): void;

  /**
   * Configure query engine timeout
   * @param timeout - Timeout in milliseconds
   */
  setTimeout(timeout: number): void;

  /**
   * Dispose of resources and clean up
   */
  dispose(): void;
}

/**
 * Configuration options for Domain Controller
 */
export interface IDomainControllerConfig {
  /** Default timeout for domain queries in milliseconds */
  defaultTimeout?: number;
  /** Maximum number of concurrent domain checks */
  maxConcurrentChecks?: number;
  /** Enable DNS-based checking */
  enableDNS?: boolean;
  /** Enable WHOIS-based checking */
  enableWHOIS?: boolean;
  /** Enable hybrid checking strategy */
  enableHybrid?: boolean;
  /** Rate limiting configuration */
  rateLimiting?: {
    enabled: boolean;
    maxRequestsPerMinute: number;
  };
}

/**
 * UI callback functions for loose coupling with presentation layer
 */
export interface IUICallbacks {
  /** Called when domain check starts */
  onCheckStart?: (request: IQueryRequest) => void;
  /** Called when domain check completes successfully */
  onCheckComplete?: (response: IQueryResponse) => void;
  /** Called when domain check fails */
  onCheckError?: (error: IQueryError) => void;
  /** Called when validation fails */
  onValidationError?: (errors: IValidationError[]) => void;
  /** Called for progress updates during batch operations */
  onProgress?: (progress: { completed: number; total: number; current?: string }) => void;
  /** Called when application state changes */
  onStateChange?: (state: string, data?: any) => void;
}

/**
 * Controller performance and usage statistics
 */
export interface IControllerStatistics {
  /** Total number of requests processed */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Average execution time in milliseconds */
  averageExecutionTime: number;
  /** Last execution time in milliseconds */
  lastExecutionTime: number;
  /** Most common error types */
  commonErrors: Array<{ code: string; count: number }>;
  /** Performance metrics by query method */
  performanceByMethod: {
    dns: { count: number; averageTime: number };
    whois: { count: number; averageTime: number };
    hybrid: { count: number; averageTime: number };
  };
}

/**
 * Domain validation result
 */
export interface IValidationResult {
  /** Whether the domain is valid */
  isValid: boolean;
  /** Sanitized domain name (normalized) */
  sanitizedDomain: string;
  /** Sanitized input (alias for compatibility) */
  sanitizedInput: string;
  /** Array of validation errors */
  errors: IValidationError[];
  /** Primary error message */
  errorMessage?: string;
  /** Validation warnings (non-blocking) */
  warnings?: string[];
  /** Suggested corrections */
  suggestions?: string[];
}

/**
 * Individual validation error
 */
export interface IValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Field that caused the error */
  field?: string;
}