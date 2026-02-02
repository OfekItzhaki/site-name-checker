import type { IDomainResult } from '../models';
import { AvailabilityStatus } from '../models/AvailabilityStatus';
import type { IQueryStrategy } from '../patterns/strategy/IQueryStrategy';
import type { ICommand } from '../patterns/command/ICommand';
import { DomainCheckCommand } from '../patterns/command/DomainCheckCommand';
import { BatchDomainCheckCommand, type IBatchDomainCheckResult } from '../patterns/command/BatchDomainCheckCommand';

/**
 * Domain Query Engine - manages TLD processing and domain availability checking
 * Implements Strategy pattern for different query approaches and Command pattern for execution
 */
export class DomainQueryEngine {
  private static readonly SUPPORTED_TLDS = ['.com', '.net', '.org', '.ai', '.dev', '.io', '.co'];
  private queryStrategy: IQueryStrategy | null = null;
  private results: Map<string, IDomainResult> = new Map();

  /**
   * Set the query strategy to use for domain checking
   * @param strategy - Query strategy implementation
   */
  setQueryStrategy(strategy: IQueryStrategy): void {
    this.queryStrategy = strategy;
  }

  /**
   * Get all supported TLDs
   * @returns Array of supported TLD strings
   */
  getSupportedTLDs(): string[] {
    return [...DomainQueryEngine.SUPPORTED_TLDS];
  }

  /**
   * Construct full domain names from base domain and all supported TLDs
   * @param baseDomain - Base domain name (without TLD)
   * @returns Array of full domain names with TLDs
   */
  constructDomains(baseDomain: string): string[] {
    if (!baseDomain || typeof baseDomain !== 'string') {
      throw new Error('Base domain must be a non-empty string');
    }

    const sanitizedBase = baseDomain.toLowerCase().trim();
    if (!sanitizedBase) {
      throw new Error('Base domain cannot be empty after sanitization');
    }

    return DomainQueryEngine.SUPPORTED_TLDS.map(tld => `${sanitizedBase}${tld}`);
  }

  /**
   * Initialize domain results for a base domain
   * @param baseDomain - Base domain name
   * @returns Array of initialized domain results
   */
  initializeDomainResults(baseDomain: string): IDomainResult[] {
    const domains = this.constructDomains(baseDomain);
    const results: IDomainResult[] = [];

    for (const domain of domains) {
      const tld = DomainQueryEngine.SUPPORTED_TLDS.find(t => domain.endsWith(t)) || '';
      
      const result: IDomainResult = {
        domain,
        baseDomain: baseDomain.toLowerCase().trim(),
        tld,
        status: AvailabilityStatus.CHECKING,
        lastChecked: new Date(),
        checkMethod: 'HYBRID' as const,
        retryCount: 0
      };

      results.push(result);
      this.results.set(domain, result);
    }

    return results;
  }

  /**
   * Create a command for checking a single domain
   * @param domain - Domain to check
   * @returns Domain check command
   */
  createDomainCheckCommand(domain: string): ICommand<IDomainResult> {
    if (!this.queryStrategy) {
      throw new Error('Query strategy must be set before creating commands');
    }

    return new DomainCheckCommand(domain, this.queryStrategy);
  }

  /**
   * Create a batch command for checking multiple domains
   * @param domains - Array of domains to check
   * @returns Batch domain check command
   */
  createBatchCheckCommand(domains: string[]): ICommand<IBatchDomainCheckResult> {
    if (!this.queryStrategy) {
      throw new Error('Query strategy must be set before creating commands');
    }

    if (!domains || domains.length === 0) {
      throw new Error('Domains array cannot be empty');
    }

    return new BatchDomainCheckCommand(domains, this.queryStrategy);
  }

  /**
   * Update a domain result
   * @param domain - Domain name
   * @param result - Updated result
   */
  updateResult(domain: string, result: IDomainResult): void {
    this.results.set(domain, { ...result });
  }

  /**
   * Get result for a specific domain
   * @param domain - Domain name
   * @returns Domain result or undefined if not found
   */
  getResult(domain: string): IDomainResult | undefined {
    return this.results.get(domain);
  }

  /**
   * Get all current results
   * @returns Array of all domain results
   */
  getAllResults(): IDomainResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get results filtered by status
   * @param status - Availability status to filter by
   * @returns Array of domain results with the specified status
   */
  getResultsByStatus(status: AvailabilityStatus): IDomainResult[] {
    return this.getAllResults().filter(result => result.status === status);
  }

  /**
   * Get aggregated results summary
   * @returns Summary of results by status
   */
  getResultsSummary(): {
    total: number;
    available: number;
    taken: number;
    checking: number;
    errors: number;
    completed: number;
  } {
    const results = this.getAllResults();
    
    return {
      total: results.length,
      available: results.filter(r => r.status === AvailabilityStatus.AVAILABLE).length,
      taken: results.filter(r => r.status === AvailabilityStatus.TAKEN).length,
      checking: results.filter(r => r.status === AvailabilityStatus.CHECKING).length,
      errors: results.filter(r => r.status === AvailabilityStatus.ERROR).length,
      completed: results.filter(r => r.status !== AvailabilityStatus.CHECKING).length
    };
  }

  /**
   * Check if all domains have been processed (no longer checking)
   * @returns True if all domains are complete
   */
  isComplete(): boolean {
    return this.getAllResults().every(result => result.status !== AvailabilityStatus.CHECKING);
  }

  /**
   * Clear all results and reset the engine
   */
  reset(): void {
    this.results.clear();
  }

  /**
   * Get domains that failed and can be retried
   * @param maxRetries - Maximum number of retries allowed
   * @returns Array of domains that can be retried
   */
  getRetryableDomains(maxRetries: number = 3): string[] {
    return this.getAllResults()
      .filter(result => 
        result.status === AvailabilityStatus.ERROR && 
        (result.retryCount || 0) < maxRetries
      )
      .map(result => result.domain);
  }

  /**
   * Get the fastest successful check time
   * @returns Minimum execution time in milliseconds, or null if no successful checks
   */
  getFastestCheckTime(): number | null {
    const successfulResults = this.getAllResults().filter(result => 
      result.executionTime !== undefined && 
      result.status !== AvailabilityStatus.ERROR
    );

    if (successfulResults.length === 0) {
      return null;
    }

    return Math.min(...successfulResults.map(result => result.executionTime!));
  }

  /**
   * Get the average check time for successful queries
   * @returns Average execution time in milliseconds, or null if no successful checks
   */
  getAverageCheckTime(): number | null {
    const successfulResults = this.getAllResults().filter(result => 
      result.executionTime !== undefined && 
      result.status !== AvailabilityStatus.ERROR
    );

    if (successfulResults.length === 0) {
      return null;
    }

    const totalTime = successfulResults.reduce((sum, result) => sum + result.executionTime!, 0);
    return totalTime / successfulResults.length;
  }

  /**
   * Validate that a domain belongs to the supported TLDs
   * @param domain - Domain to validate
   * @returns True if domain has a supported TLD
   */
  isSupportedDomain(domain: string): boolean {
    return DomainQueryEngine.SUPPORTED_TLDS.some(tld => domain.toLowerCase().endsWith(tld));
  }

  /**
   * Extract base domain from a full domain name
   * @param domain - Full domain name
   * @returns Base domain without TLD, or null if not a supported domain
   */
  extractBaseDomain(domain: string): string | null {
    const lowerDomain = domain.toLowerCase();
    
    for (const tld of DomainQueryEngine.SUPPORTED_TLDS) {
      if (lowerDomain.endsWith(tld)) {
        return lowerDomain.slice(0, -tld.length);
      }
    }
    
    return null;
  }
}