import { lookup } from 'whois';
import type { IDomainResult } from '../models';
import { AvailabilityStatus } from '../models/AvailabilityStatus';
import type { IQueryStrategy, IStrategyConfig } from '../patterns/strategy/IQueryStrategy';

/**
 * WHOIS Query Service - provides definitive domain availability checking using WHOIS protocol
 * Implements the Strategy pattern for WHOIS-based domain checking
 */
export class WHOISQueryService implements IQueryStrategy {
  private config: IStrategyConfig = {
    timeoutMs: 10000, // 10 second timeout for WHOIS queries
    maxRetries: 3,
    retryDelayMs: 1000,
    useExponentialBackoff: true,
    priority: 1, // Lower priority than DNS for accuracy over speed
    enabled: true
  };

  private rateLimitDelay = 1000; // 1 second delay between requests
  private lastRequestTime = 0;

  /**
   * Check domain availability (alias for execute method)
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result
   */
  async checkDomain(domain: string): Promise<IDomainResult> {
    return this.execute(domain);
  }



  /**
   * Execute WHOIS-based domain availability check
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result
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
        checkMethod: 'WHOIS' as const,
        retryCount: 0,
        executionTime,
        error: 'Invalid domain format'
      };
    }

    try {
      // Apply rate limiting
      await this.applyRateLimit();

      // Perform WHOIS lookup with timeout and retries
      const whoisData = await this.performWHOISLookup(domain);
      const executionTime = Date.now() - startTime;

      const availability = this.parseWHOISResponse(whoisData);

      return {
        domain,
        baseDomain,
        tld,
        status: availability.status,
        lastChecked: new Date(),
        checkMethod: 'WHOIS' as const,
        retryCount: 0,
        executionTime,
        ...(availability.whoisData && { whoisData: availability.whoisData })
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'WHOIS lookup failed';

      return {
        domain,
        baseDomain,
        tld,
        status: AvailabilityStatus.ERROR,
        lastChecked: new Date(),
        checkMethod: 'WHOIS' as const,
        retryCount: 0,
        executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * Get the service type identifier
   * @returns Service type string
   */
  getServiceType(): 'WHOIS' {
    return 'WHOIS';
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
  }

  /**
   * Set rate limit delay between requests
   * @param delayMs - Delay in milliseconds
   */
  setRateLimitDelay(delayMs: number): void {
    this.rateLimitDelay = Math.max(0, delayMs);
  }

  /**
   * Determine if this strategy can handle the given domain
   * @param domain - Domain name to evaluate
   * @returns True if this strategy can handle the domain
   */
  canHandle(domain: string): boolean {
    // WHOIS can handle most domain formats, but some TLDs may not support WHOIS
    return this.isValidDomainFormat(domain) && this.isSupportedTLD(domain);
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
    return 'WHOISQueryService';
  }

  /**
   * Get current rate limiting delay
   * @returns Current delay in milliseconds
   */
  getRateLimitDelay(): number {
    return this.rateLimitDelay;
  }

  /**
   * Apply rate limiting to prevent overwhelming WHOIS servers
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Perform WHOIS lookup with timeout and retry logic
   * @param domain - Domain to lookup
   * @returns WHOIS response data
   */
  private async performWHOISLookup(domain: string): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.whoisLookupWithTimeout(domain);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('WHOIS lookup failed');
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < this.config.maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    
    throw lastError || new Error('WHOIS lookup failed after all retries');
  }

  /**
   * Perform WHOIS lookup with timeout
   * @param domain - Domain to lookup
   * @returns Promise resolving to WHOIS data
   */
  private async whoisLookupWithTimeout(domain: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`WHOIS lookup timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      lookup(domain, (error: Error | null, data: string | any) => {
        clearTimeout(timeoutId);
        
        if (error) {
          reject(error);
        } else {
          // Handle both string and array responses from whois library
          const whoisData = Array.isArray(data) ? data.join('\n') : (data || '');
          resolve(whoisData);
        }
      });
    });
  }

  /**
   * Parse WHOIS response to determine domain availability
   * @param whoisData - Raw WHOIS response
   * @returns Parsed availability information
   */
  private parseWHOISResponse(whoisData: string): {
    status: AvailabilityStatus;
    registrar?: string;
    expirationDate?: Date;
    whoisData?: any;
  } {
    const lowerData = whoisData.toLowerCase();
    
    // Common patterns indicating domain is available
    const availablePatterns = [
      'no match',
      'not found',
      'no entries found',
      'no data found',
      'available',
      'not registered',
      'no matching record',
      'status: available',
      'domain status: no object found'
    ];

    // Common patterns indicating domain is taken
    const takenPatterns = [
      'registrar:',
      'creation date:',
      'created:',
      'registered:',
      'domain status: ok',
      'domain status: active',
      'registry expiry date:',
      'expiry date:',
      'expires:'
    ];

    // Check for availability indicators
    for (const pattern of availablePatterns) {
      if (lowerData.includes(pattern)) {
        return { status: AvailabilityStatus.AVAILABLE };
      }
    }

    // Check for taken indicators and extract additional info
    let registrar: string | undefined;
    let expirationDate: Date | undefined;

    for (const pattern of takenPatterns) {
      if (lowerData.includes(pattern)) {
        // Extract registrar information
        const registrarMatch = whoisData.match(/registrar:\s*(.+)/i);
        if (registrarMatch && registrarMatch[1]) {
          registrar = registrarMatch[1].trim();
        }

        // Extract expiration date
        const expiryMatches = [
          /registry expiry date:\s*(.+)/i,
          /expiry date:\s*(.+)/i,
          /expires:\s*(.+)/i,
          /expiration date:\s*(.+)/i
        ];

        for (const expiryPattern of expiryMatches) {
          const match = whoisData.match(expiryPattern);
          if (match && match[1]) {
            const dateStr = match[1].trim();
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              expirationDate = parsedDate;
              break;
            }
          }
        }

        return {
          status: AvailabilityStatus.TAKEN,
          ...(registrar && { registrar }),
          ...(expirationDate && { expirationDate }),
          ...((registrar || expirationDate) && { 
            whoisData: {
              ...(registrar && { registrar }),
              ...(expirationDate && { expirationDate })
            }
          })
        };
      }
    }

    // If we can't determine status from patterns, check response length and content
    if (whoisData.trim().length === 0) {
      return { status: AvailabilityStatus.AVAILABLE };
    }

    // If response contains substantial data but no clear indicators, assume taken
    // Lowered threshold to handle ambiguous responses as taken (per test requirements)
    if (whoisData.length > 50) {
      return { status: AvailabilityStatus.TAKEN };
    }

    // Default to error for very short responses that might be error messages
    return { status: AvailabilityStatus.ERROR };
  }

  /**
   * Check if the TLD is supported by WHOIS
   * @param domain - Domain to check
   * @returns True if TLD is supported
   */
  private isSupportedTLD(domain: string): boolean {
    const tld = this.extractTLD(domain).toLowerCase();
    
    // Most common TLDs support WHOIS
    const supportedTLDs = [
      '.com', '.net', '.org', '.info', '.biz', '.name',
      '.co', '.io', '.ai', '.dev', '.app', '.tech',
      '.me', '.tv', '.cc', '.ws', '.mobi'
    ];

    return supportedTLDs.includes(tld);
  }

  /**
   * Extract base domain from full domain name
   * @param domain - Full domain name
   * @returns Base domain without TLD
   */
  private extractBaseDomain(domain: string): string {
    const parts = domain.toLowerCase().split('.');
    if (parts.length >= 2) {
      // Return everything except the TLD
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
   * Validate domain format for WHOIS lookup
   * @param domain - Domain to validate
   * @returns True if domain format is valid for WHOIS
   */
  private isValidDomainFormat(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Basic domain format validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * Get detailed WHOIS information for a domain
   * @param domain - Domain to analyze
   * @returns Detailed WHOIS information
   */
  async getDetailedWHOISInfo(domain: string): Promise<{
    domain: string;
    rawData: string;
    registrar?: string;
    registrationDate?: Date;
    expirationDate?: Date;
    nameServers?: string[];
    status?: string[];
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      await this.applyRateLimit();
      const rawData = await this.performWHOISLookup(domain);
      const executionTime = Date.now() - startTime;

      // Parse detailed information
      const registrarMatch = rawData.match(/registrar:\s*(.+)/i);
      const registrar = (registrarMatch && registrarMatch[1]) ? registrarMatch[1].trim() : undefined;

      const creationMatches = [
        /creation date:\s*(.+)/i,
        /created:\s*(.+)/i,
        /registered:\s*(.+)/i
      ];
      
      let registrationDate: Date | undefined;
      for (const pattern of creationMatches) {
        const match = rawData.match(pattern);
        if (match && match[1]) {
          const dateStr = match[1].trim();
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            registrationDate = parsedDate;
            break;
          }
        }
      }

      const expiryMatches = [
        /registry expiry date:\s*(.+)/i,
        /expiry date:\s*(.+)/i,
        /expires:\s*(.+)/i
      ];
      
      let expirationDate: Date | undefined;
      for (const pattern of expiryMatches) {
        const match = rawData.match(pattern);
        if (match && match[1]) {
          const dateStr = match[1].trim();
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            expirationDate = parsedDate;
            break;
          }
        }
      }

      // Extract name servers
      const nameServerMatches = rawData.match(/name server:\s*(.+)/gi);
      const nameServers = nameServerMatches?.map(match => 
        match.replace(/name server:\s*/i, '').trim()
      ) || undefined;

      // Extract status information
      const statusMatches = rawData.match(/domain status:\s*(.+)/gi);
      const status = statusMatches?.map(match => 
        match.replace(/domain status:\s*/i, '').trim()
      ) || undefined;

      return {
        domain,
        rawData,
        ...(registrar && { registrar }),
        ...(registrationDate && { registrationDate }),
        ...(expirationDate && { expirationDate }),
        ...(nameServers && { nameServers }),
        ...(status && { status }),
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        domain,
        rawData: '',
        executionTime
      };
    }
  }
}