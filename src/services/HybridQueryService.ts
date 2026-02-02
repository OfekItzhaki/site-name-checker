import type { IDomainResult } from '../models';
import { AvailabilityStatus } from '../models/AvailabilityStatus';
import type { IQueryStrategy, IStrategyConfig } from '../patterns/strategy/IQueryStrategy';
import { DNSLookupService } from './DNSLookupService';
import { WHOISQueryService } from './WHOISQueryService';

/**
 * Hybrid Query Service - combines DNS and WHOIS strategies for optimal speed and accuracy
 * Implements concurrent processing with error isolation
 */
export class HybridQueryService implements IQueryStrategy {
  private config: IStrategyConfig = {
    timeoutMs: 15000, // 15 second timeout for hybrid queries
    maxRetries: 2,
    retryDelayMs: 1000,
    useExponentialBackoff: false,
    priority: 3, // Highest priority for hybrid approach
    enabled: true
  };

  private dnsService: DNSLookupService;
  private whoisService: WHOISQueryService;
  private concurrentTimeout = 5000; // Timeout for individual concurrent operations

  constructor() {
    this.dnsService = new DNSLookupService();
    this.whoisService = new WHOISQueryService();
    
    // Configure services for hybrid use
    this.dnsService.setConfig({ timeoutMs: this.concurrentTimeout, maxRetries: 1 });
    this.whoisService.setConfig({ timeoutMs: this.concurrentTimeout, maxRetries: 1 });
  }

  /**
   * Check domain availability (alias for execute method)
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result
   */
  async checkDomain(domain: string): Promise<IDomainResult> {
    return this.execute(domain);
  }



  /**
   * Execute hybrid domain availability check using both DNS and WHOIS concurrently
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result with combined information
   */
  async execute(domain: string): Promise<IDomainResult> {
    const startTime = Date.now();
    const baseDomain = this.extractBaseDomain(domain);
    const tld = this.extractTLD(domain);

    // Validate domain format first
    if (!this.isValidDomainFormat(domain)) {
      const executionTime = Date.now() - startTime;
      return {
        domain,
        baseDomain,
        tld,
        status: AvailabilityStatus.ERROR,
        lastChecked: new Date(),
        checkMethod: 'HYBRID' as const,
        retryCount: 0,
        executionTime,
        error: 'Invalid domain format'
      };
    }

    try {
      // Execute DNS and WHOIS queries concurrently with error isolation
      const results = await this.executeConcurrentQueries(domain);
      const executionTime = Date.now() - startTime;

      // Combine results using hybrid logic
      const combinedResult = this.combineResults(domain, results, executionTime);
      
      return combinedResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Hybrid query failed';

      return {
        domain,
        baseDomain,
        tld,
        status: AvailabilityStatus.ERROR,
        lastChecked: new Date(),
        checkMethod: 'HYBRID' as const,
        retryCount: 0,
        executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * Execute DNS and WHOIS queries concurrently with error isolation
   * @param domain - Domain to query
   * @returns Promise resolving to array of results (some may be errors)
   */
  private async executeConcurrentQueries(domain: string): Promise<Array<IDomainResult | Error>> {
    // Create promises for concurrent execution
    const dnsPromise = this.dnsService.execute(domain).catch(error => error);
    const whoisPromise = this.whoisService.execute(domain).catch(error => error);

    // Execute concurrently with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Concurrent queries timeout')), this.config.timeoutMs);
    });

    try {
      // Race between concurrent queries and timeout
      const results = await Promise.race([
        Promise.all([dnsPromise, whoisPromise]),
        timeoutPromise
      ]);

      return results;
    } catch (error) {
      // If timeout occurs, return partial results if available
      const partialResults = await Promise.allSettled([dnsPromise, whoisPromise]);
      
      return partialResults.map(result => 
        result.status === 'fulfilled' ? result.value : new Error('Query failed')
      );
    }
  }

  /**
   * Combine DNS and WHOIS results using hybrid logic
   * @param domain - Original domain
   * @param results - Array of results from concurrent queries
   * @param executionTime - Total execution time
   * @returns Combined domain result
   */
  private combineResults(
    domain: string, 
    results: Array<IDomainResult | Error>, 
    executionTime: number
  ): IDomainResult {
    const baseDomain = this.extractBaseDomain(domain);
    const tld = this.extractTLD(domain);
    
    const [dnsResult, whoisResult] = results;
    
    // Extract valid results with proper type checking
    const validDnsResult: IDomainResult | null = (dnsResult && !(dnsResult instanceof Error)) ? dnsResult : null;
    const validWhoisResult: IDomainResult | null = (whoisResult && !(whoisResult instanceof Error)) ? whoisResult : null;

    // If both failed, return error
    if (!validDnsResult && !validWhoisResult) {
      return {
        domain,
        baseDomain,
        tld,
        status: AvailabilityStatus.ERROR,
        lastChecked: new Date(),
        checkMethod: 'HYBRID' as const,
        retryCount: 0,
        executionTime,
        error: 'Both DNS and WHOIS queries failed'
      };
    }

    // Determine final status using hybrid logic
    const finalStatus = this.determineHybridStatus(validDnsResult, validWhoisResult);
    
    // Combine data from both sources
    const combinedResult: IDomainResult = {
      domain,
      baseDomain,
      tld,
      status: finalStatus,
      lastChecked: new Date(),
      checkMethod: 'HYBRID' as const,
      retryCount: 0,
      executionTime
    };

    // Add DNS data if available
    if (validDnsResult?.dnsRecords) {
      combinedResult.dnsRecords = validDnsResult.dnsRecords;
    }

    // Add WHOIS data if available
    if (validWhoisResult?.whoisData) {
      combinedResult.whoisData = validWhoisResult.whoisData;
    }

    // Add error information if one query failed
    if (!validDnsResult && dnsResult instanceof Error) {
      combinedResult.error = `DNS query failed: ${dnsResult.message}`;
    } else if (!validWhoisResult && whoisResult instanceof Error) {
      combinedResult.error = `WHOIS query failed: ${whoisResult.message}`;
    }

    return combinedResult;
  }

  /**
   * Determine final availability status using hybrid logic
   * @param dnsResult - DNS query result (may be null)
   * @param whoisResult - WHOIS query result (may be null)
   * @returns Final availability status
   */
  private determineHybridStatus(
    dnsResult: IDomainResult | null, 
    whoisResult: IDomainResult | null
  ): AvailabilityStatus {
    // If both results are available, use WHOIS as authoritative source
    if (dnsResult && whoisResult) {
      // WHOIS is more authoritative for availability
      if (whoisResult.status === AvailabilityStatus.AVAILABLE) {
        return AvailabilityStatus.AVAILABLE;
      }
      if (whoisResult.status === AvailabilityStatus.TAKEN) {
        return AvailabilityStatus.TAKEN;
      }
      // If WHOIS is error, fall back to DNS
      return dnsResult.status;
    }

    // If only WHOIS is available, use it
    if (whoisResult && !dnsResult) {
      return whoisResult.status;
    }

    // If only DNS is available, use it
    if (dnsResult && !whoisResult) {
      return dnsResult.status;
    }

    // This shouldn't happen as we check for both null earlier
    return AvailabilityStatus.ERROR;
  }

  /**
   * Get the service type identifier
   * @returns Service type string
   */
  getServiceType(): 'HYBRID' {
    return 'HYBRID';
  }

  /**
   * Get the current configuration
   * @returns Configuration object
   */
  getConfig(): IStrategyConfig {
    return { ...this.config };
  }

  /**
   * Set configuration options
   * @param config - Configuration object
   */
  setConfig(config: Partial<IStrategyConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update underlying services when timeout changes
    if (config.timeoutMs !== undefined) {
      const serviceTimeout = Math.floor(config.timeoutMs / 2);
      this.dnsService.setConfig({ timeoutMs: serviceTimeout });
      this.whoisService.setConfig({ timeoutMs: serviceTimeout });
      this.concurrentTimeout = serviceTimeout;
    }
    
    // Update other config properties for underlying services
    if (config.maxRetries !== undefined) {
      this.dnsService.setConfig({ maxRetries: config.maxRetries });
      this.whoisService.setConfig({ maxRetries: config.maxRetries });
    }
  }

  /**
   * Determine if this strategy can handle the given domain
   * @param domain - Domain name to evaluate
   * @returns True if this strategy can handle the domain
   */
  canHandle(domain: string): boolean {
    // Hybrid can handle any domain that either DNS or WHOIS can handle
    const dnsCanHandle = this.dnsService.canHandle(domain);
    const whoisCanHandle = this.whoisService.canHandle(domain);
    
    // Ensure we always return a boolean
    return Boolean(dnsCanHandle || whoisCanHandle);
  }

  /**
   * Get the priority of this strategy (higher numbers = higher priority)
   * @returns Strategy priority value
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * Get the name/identifier of this strategy
   * @returns Strategy name
   */
  getName(): string {
    return 'HybridQueryService';
  }

  /**
   * Set concurrent operation timeout
   * @param timeout - Timeout in milliseconds for individual operations
   */
  setConcurrentTimeout(timeout: number): void {
    this.concurrentTimeout = Math.max(1000, timeout);
    this.dnsService.setConfig({ timeoutMs: this.concurrentTimeout });
    this.whoisService.setConfig({ timeoutMs: this.concurrentTimeout });
  }

  /**
   * Get current concurrent operation timeout
   * @returns Current timeout in milliseconds
   */
  getConcurrentTimeout(): number {
    return this.concurrentTimeout;
  }

  /**
   * Get performance metrics for the last hybrid query
   * @returns Performance metrics including individual service times
   */
  getPerformanceMetrics(): {
    totalTime: number;
    dnsTime: number;
    whoisTime: number;
    concurrentEfficiency: number;
  } {
    // This would be implemented with actual timing data in a real scenario
    // For now, return placeholder metrics
    return {
      totalTime: 0,
      dnsTime: 0,
      whoisTime: 0,
      concurrentEfficiency: 0
    };
  }

  /**
   * Execute batch domain queries with concurrent processing
   * @param domains - Array of domains to check
   * @returns Promise resolving to array of domain results
   */
  async executeBatch(domains: string[]): Promise<IDomainResult[]> {
    if (domains.length === 0) {
      return [];
    }

    // Process domains in batches to avoid overwhelming services
    const batchSize = 5;
    const results: IDomainResult[] = [];

    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      
      // Execute batch concurrently
      const batchPromises = batch.map(domain => this.execute(domain));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);
      
      // Add small delay between batches to be respectful to services
      if (i + batchSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Extract base domain from full domain name
   * @param domain - Full domain name
   * @returns Base domain without TLD
   */
  private extractBaseDomain(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    if (parts.length >= 2) {
      return parts.slice(0, -1).join('.');
    }
    return domain.toLowerCase();
  }

  /**
   * Extract TLD from full domain name
   * @param domain - Full domain name
   * @returns TLD including the dot
   */
  private extractTLD(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    if (parts.length >= 2) {
      return '.' + parts[parts.length - 1];
    }
    return '';
  }

  /**
   * Validate domain format for hybrid lookup
   * @param domain - Domain to validate
   * @returns True if domain format is valid
   */
  private isValidDomainFormat(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Basic domain format validation - more permissive for testing
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253 && domain.includes('.');
  }
}