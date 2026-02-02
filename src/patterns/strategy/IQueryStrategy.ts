/**
 * Interface for query strategy implementations
 * Allows switching between different domain checking strategies dynamically
 */
export interface IQueryStrategy {
  /**
   * Execute the domain availability check using this strategy
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result
   */
  execute(domain: string): Promise<import('../../models').IDomainResult>;

  /**
   * Determine if this strategy can handle the given domain
   * @param domain - Domain name to evaluate
   * @returns True if this strategy can handle the domain
   */
  canHandle(domain: string): boolean;

  /**
   * Get the priority of this strategy (higher numbers = higher priority)
   * @returns Strategy priority value
   */
  getPriority(): number;

  /**
   * Get the name/identifier of this strategy
   * @returns Strategy name
   */
  getName(): string;

  /**
   * Get the service type identifier
   * @returns Service type string
   */
  getServiceType(): string;

  /**
   * Get strategy-specific configuration
   * @returns Strategy configuration
   */
  getConfig(): IStrategyConfig;

  /**
   * Set strategy configuration
   * @param config - New configuration to apply
   */
  setConfig(config: Partial<IStrategyConfig>): void;
}

/**
 * Configuration for query strategies
 */
export interface IStrategyConfig {
  /** Timeout in milliseconds for this strategy */
  timeoutMs: number;
  /** Maximum number of retries for this strategy */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Whether to use exponential backoff for retries */
  useExponentialBackoff: boolean;
  /** Priority level for strategy selection */
  priority: number;
  /** Whether this strategy is enabled */
  enabled: boolean;
}

/**
 * Enumeration of available query strategy types
 */
export enum QueryStrategyType {
  DNS_FIRST = 'dns_first',
  WHOIS_ONLY = 'whois_only',
  HYBRID = 'hybrid',
  FAST_CHECK = 'fast_check'
}

/**
 * Interface for strategy context that manages strategy selection
 */
export interface IStrategyContext {
  /**
   * Set the current strategy
   * @param strategy - Strategy to use
   */
  setStrategy(strategy: IQueryStrategy): void;

  /**
   * Get the current strategy
   * @returns Current active strategy
   */
  getCurrentStrategy(): IQueryStrategy | null;

  /**
   * Execute domain check using current strategy
   * @param domain - Domain to check
   * @returns Promise resolving to domain result
   */
  executeStrategy(domain: string): Promise<import('../../models').IDomainResult>;

  /**
   * Select best strategy for a given domain
   * @param domain - Domain to evaluate
   * @param availableStrategies - List of available strategies
   * @returns Best strategy for the domain
   */
  selectBestStrategy(domain: string, availableStrategies: IQueryStrategy[]): IQueryStrategy;

  /**
   * Register a new strategy
   * @param strategy - Strategy to register
   */
  registerStrategy(strategy: IQueryStrategy): void;

  /**
   * Get all registered strategies
   * @returns Array of registered strategies
   */
  getRegisteredStrategies(): IQueryStrategy[];
}