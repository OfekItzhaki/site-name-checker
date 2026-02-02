import { promises as dns } from 'dns';
import type { IDomainResult } from '../models';
import { AvailabilityStatus } from '../models/AvailabilityStatus';
import type { IQueryStrategy, IStrategyConfig } from '../patterns/strategy/IQueryStrategy';

/**
 * DNS Lookup Service - provides fast domain availability checking using DNS resolution
 * Implements the Strategy pattern for DNS-based domain checking
 */
export class DNSLookupService implements IQueryStrategy {
  private config: IStrategyConfig = {
    timeoutMs: 5000, // 5 second timeout for DNS queries
    maxRetries: 2,
    retryDelayMs: 500,
    useExponentialBackoff: false,
    priority: 2, // Higher priority than WHOIS for speed
    enabled: true
  };

  /**
   * Check domain availability (alias for execute method)
   * @param domain - Full domain name to check
   * @returns Promise resolving to domain result
   */
  async checkDomain(domain: string): Promise<IDomainResult> {
    return this.execute(domain);
  }



  /**
   * Execute DNS-based domain availability check
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
        checkMethod: 'DNS' as const,
        retryCount: 0,
        executionTime,
        error: 'Invalid domain format'
      };
    }

    try {
      // Perform DNS resolution with timeout
      const result = await this.performDNSLookup(domain);
      const executionTime = Date.now() - startTime;

      return {
        domain,
        baseDomain,
        tld,
        status: result.available ? AvailabilityStatus.AVAILABLE : AvailabilityStatus.TAKEN,
        lastChecked: new Date(),
        checkMethod: 'DNS' as const,
        retryCount: 0,
        executionTime,
        ...(result.records && result.records.length > 0 && { dnsRecords: result.records })
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'DNS lookup failed';

      return {
        domain,
        baseDomain,
        tld,
        status: AvailabilityStatus.ERROR,
        lastChecked: new Date(),
        checkMethod: 'DNS' as const,
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
  getServiceType(): 'DNS' {
    return 'DNS';
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
   * Determine if this strategy can handle the given domain
   * @param domain - Domain name to evaluate
   * @returns True if this strategy can handle the domain
   */
  canHandle(domain: string): boolean {
    // DNS lookup can handle any valid domain format
    return this.isValidDomainFormat(domain);
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
    return 'DNSLookupService';
  }

  /**
   * Perform DNS lookup with timeout handling
   * @param domain - Domain to lookup
   * @returns DNS lookup result
   */
  private async performDNSLookup(domain: string): Promise<{
    available: boolean;
    records: string[];
  }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`DNS lookup timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      // Try multiple DNS record types to determine availability
      Promise.allSettled([
        this.lookupARecord(domain),
        this.lookupAAAARecord(domain),
        this.lookupMXRecord(domain),
        this.lookupNSRecord(domain)
      ]).then(results => {
        clearTimeout(timeoutId);

        const records: string[] = [];
        let hasAnyRecords = false;
        let hasNetworkErrors = false;

        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            hasAnyRecords = true;
            const recordType = ['A', 'AAAA', 'MX', 'NS'][index];
            records.push(`${recordType}: ${result.value.join(', ')}`);
          } else if (result.status === 'rejected') {
            // Check if this is a network error vs domain not found
            const error = result.reason;
            if (error && typeof error.code === 'string') {
              const availabilityErrorCodes = ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'];
              if (!availabilityErrorCodes.includes(error.code)) {
                hasNetworkErrors = true;
              }
            } else if (error && error.message && !error.message.includes('NXDOMAIN')) {
              // Generic errors that don't indicate domain availability
              hasNetworkErrors = true;
            }
          }
        });

        // If we have network errors, reject the promise
        if (hasNetworkErrors && !hasAnyRecords) {
          reject(new Error('Network error during DNS lookup'));
          return;
        }

        // If domain has DNS records, it's likely taken
        // If no records found, it might be available (but not definitive)
        resolve({
          available: !hasAnyRecords,
          records: records.length > 0 ? records : []
        });
      }).catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Lookup A records for domain
   * @param domain - Domain to lookup
   * @returns Promise resolving to A record addresses
   */
  private async lookupARecord(domain: string): Promise<string[]> {
    try {
      const addresses = await dns.resolve4(domain);
      return addresses;
    } catch (error: any) {
      // Re-throw network errors, but handle domain-not-found errors
      if (error && error.code && !['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error.code)) {
        throw error; // Network error - re-throw
      }
      // NXDOMAIN or other DNS errors indicate no A record
      return [];
    }
  }

  /**
   * Lookup AAAA records for domain
   * @param domain - Domain to lookup
   * @returns Promise resolving to AAAA record addresses
   */
  private async lookupAAAARecord(domain: string): Promise<string[]> {
    try {
      const addresses = await dns.resolve6(domain);
      return addresses;
    } catch (error: any) {
      // Re-throw network errors, but handle domain-not-found errors
      if (error && error.code && !['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error.code)) {
        throw error; // Network error - re-throw
      }
      return [];
    }
  }

  /**
   * Lookup MX records for domain
   * @param domain - Domain to lookup
   * @returns Promise resolving to MX record exchanges
   */
  private async lookupMXRecord(domain: string): Promise<string[]> {
    try {
      const mxRecords = await dns.resolveMx(domain);
      return mxRecords.map(mx => `${mx.priority} ${mx.exchange}`);
    } catch (error: any) {
      // Re-throw network errors, but handle domain-not-found errors
      if (error && error.code && !['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error.code)) {
        throw error; // Network error - re-throw
      }
      return [];
    }
  }

  /**
   * Lookup NS records for domain
   * @param domain - Domain to lookup
   * @returns Promise resolving to NS record nameservers
   */
  private async lookupNSRecord(domain: string): Promise<string[]> {
    try {
      const nameservers = await dns.resolveNs(domain);
      return nameservers;
    } catch (error: any) {
      // Re-throw network errors, but handle domain-not-found errors
      if (error && error.code && !['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(error.code)) {
        throw error; // Network error - re-throw
      }
      return [];
    }
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
   * Validate domain format for DNS lookup
   * @param domain - Domain to validate
   * @returns True if domain format is valid for DNS
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
   * Get DNS server information
   * @returns Current DNS server configuration
   */
  async getDNSServers(): Promise<string[]> {
    try {
      return dns.getServers();
    } catch (error) {
      return ['8.8.8.8', '8.8.4.4']; // Fallback to Google DNS
    }
  }

  /**
   * Set custom DNS servers
   * @param servers - Array of DNS server addresses
   */
  setDNSServers(servers: string[]): void {
    try {
      dns.setServers(servers);
    } catch (error) {
      console.warn('Failed to set DNS servers:', error);
    }
  }

  /**
   * Perform reverse DNS lookup
   * @param ip - IP address to lookup
   * @returns Promise resolving to hostnames
   */
  async reverseLookup(ip: string): Promise<string[]> {
    try {
      const hostnames = await dns.reverse(ip);
      return hostnames;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get detailed DNS information for debugging
   * @param domain - Domain to analyze
   * @returns Detailed DNS information
   */
  async getDNSInfo(domain: string): Promise<{
    domain: string;
    aRecords: string[];
    aaaaRecords: string[];
    mxRecords: string[];
    nsRecords: string[];
    txtRecords: string[];
    servers: string[];
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    const [aRecords, aaaaRecords, mxRecords, nsRecords, txtRecords, servers] = await Promise.allSettled([
      this.lookupARecord(domain),
      this.lookupAAAARecord(domain),
      this.lookupMXRecord(domain),
      this.lookupNSRecord(domain),
      this.lookupTXTRecord(domain),
      this.getDNSServers()
    ]);

    const executionTime = Date.now() - startTime;

    return {
      domain,
      aRecords: aRecords.status === 'fulfilled' ? aRecords.value : [],
      aaaaRecords: aaaaRecords.status === 'fulfilled' ? aaaaRecords.value : [],
      mxRecords: mxRecords.status === 'fulfilled' ? mxRecords.value : [],
      nsRecords: nsRecords.status === 'fulfilled' ? nsRecords.value : [],
      txtRecords: txtRecords.status === 'fulfilled' ? txtRecords.value : [],
      servers: servers.status === 'fulfilled' ? servers.value : ['8.8.8.8', '8.8.4.4'], // Ensure servers is always an array
      executionTime
    };
  }

  /**
   * Lookup TXT records for domain
   * @param domain - Domain to lookup
   * @returns Promise resolving to TXT records
   */
  private async lookupTXTRecord(domain: string): Promise<string[]> {
    try {
      const txtRecords = await dns.resolveTxt(domain);
      return txtRecords.map(record => record.join(''));
    } catch (error) {
      return [];
    }
  }
}