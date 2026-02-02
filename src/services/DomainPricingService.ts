import type { IDomainResult } from '../models';

/**
 * Domain pricing information
 */
export interface IDomainPricing {
  /** Domain name */
  domain: string;
  /** TLD extension */
  tld: string;
  /** First year registration price in USD */
  firstYearPrice: number;
  /** Annual renewal price in USD */
  renewalPrice: number;
  /** Recommended registrar */
  registrar: string;
  /** Registrar website URL */
  registrarUrl: string;
  /** Whether this is a premium domain */
  isPremium: boolean;
  /** Additional notes about pricing */
  notes?: string;
}

/**
 * Domain Pricing Service - provides estimated pricing information for domain registration
 * Based on typical market rates from major registrars (2024 data)
 */
export class DomainPricingService {
  private readonly pricingData: Map<string, {
    firstYear: number;
    renewal: number;
    registrar: string;
    registrarUrl: string;
    isPremium: boolean;
    notes?: string;
  }> = new Map([
    // Standard TLDs
    ['.com', {
      firstYear: 8.99,
      renewal: 14.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: false,
      notes: 'Most popular and trusted extension'
    }],
    ['.net', {
      firstYear: 10.99,
      renewal: 15.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: false,
      notes: 'Good alternative to .com'
    }],
    ['.org', {
      firstYear: 9.99,
      renewal: 14.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: false,
      notes: 'Ideal for organizations and nonprofits'
    }],
    
    // Premium/Specialty TLDs
    ['.ai', {
      firstYear: 79.99,
      renewal: 89.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: true,
      notes: 'Popular for AI and tech companies'
    }],
    ['.dev', {
      firstYear: 12.99,
      renewal: 17.99,
      registrar: 'Google Domains',
      registrarUrl: 'https://domains.google.com',
      isPremium: false,
      notes: 'Perfect for developers and tech projects'
    }],
    ['.io', {
      firstYear: 49.99,
      renewal: 59.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: true,
      notes: 'Popular with startups and tech companies'
    }],
    ['.co', {
      firstYear: 24.99,
      renewal: 32.99,
      registrar: 'Namecheap',
      registrarUrl: 'https://www.namecheap.com',
      isPremium: false,
      notes: 'Short alternative to .com'
    }]
  ]);

  /**
   * Get pricing information for a domain
   * @param domain - Full domain name (e.g., "example.com")
   * @returns Domain pricing information
   */
  getDomainPricing(domain: string): IDomainPricing | null {
    const tld = this.extractTLD(domain);
    if (!tld) {
      return null;
    }

    const pricing = this.pricingData.get(tld);
    if (!pricing) {
      return null;
    }

    return {
      domain,
      tld,
      firstYearPrice: pricing.firstYear,
      renewalPrice: pricing.renewal,
      registrar: pricing.registrar,
      registrarUrl: pricing.registrarUrl,
      isPremium: pricing.isPremium,
      ...(pricing.notes && { notes: pricing.notes })
    };
  }

  /**
   * Get pricing information for multiple domains
   * @param domains - Array of domain names
   * @returns Array of pricing information
   */
  getBulkDomainPricing(domains: string[]): IDomainPricing[] {
    return domains
      .map(domain => this.getDomainPricing(domain))
      .filter((pricing): pricing is IDomainPricing => pricing !== null);
  }

  /**
   * Get pricing information for domain results
   * @param results - Array of domain results
   * @returns Array of pricing information for available domains
   */
  getPricingForResults(results: IDomainResult[]): IDomainPricing[] {
    const availableDomains = results
      .filter(result => result.status === 'available')
      .map(result => result.domain);
    
    return this.getBulkDomainPricing(availableDomains);
  }

  /**
   * Get all supported TLDs with their pricing
   * @returns Array of TLD pricing information
   */
  getAllTLDPricing(): Array<{
    tld: string;
    firstYear: number;
    renewal: number;
    registrar: string;
    isPremium: boolean;
    notes?: string;
  }> {
    return Array.from(this.pricingData.entries()).map(([tld, pricing]) => ({
      tld,
      firstYear: pricing.firstYear,
      renewal: pricing.renewal,
      registrar: pricing.registrar,
      isPremium: pricing.isPremium,
      ...(pricing.notes && { notes: pricing.notes })
    }));
  }

  /**
   * Calculate total cost for multiple years
   * @param domain - Domain name
   * @param years - Number of years
   * @returns Total cost or null if pricing not available
   */
  calculateMultiYearCost(domain: string, years: number): number | null {
    const pricing = this.getDomainPricing(domain);
    if (!pricing || years < 1) {
      return null;
    }

    if (years === 1) {
      return pricing.firstYearPrice;
    }

    // First year + (additional years * renewal price)
    return pricing.firstYearPrice + ((years - 1) * pricing.renewalPrice);
  }

  /**
   * Get price comparison across registrars (simplified version)
   * @param domain - Domain name
   * @returns Array of pricing options from different registrars
   */
  getPriceComparison(domain: string): Array<{
    registrar: string;
    firstYear: number;
    renewal: number;
    url: string;
    features: string[];
  }> {
    const tld = this.extractTLD(domain);
    if (!tld) {
      return [];
    }

    // Simplified comparison data - in a real app, this would come from APIs
    const basePrice = this.pricingData.get(tld);
    if (!basePrice) {
      return [];
    }

    return [
      {
        registrar: 'Namecheap',
        firstYear: basePrice.firstYear,
        renewal: basePrice.renewal,
        url: 'https://www.namecheap.com',
        features: ['Free WHOIS Privacy', 'Free DNS Management', '24/7 Support']
      },
      {
        registrar: 'GoDaddy',
        firstYear: basePrice.firstYear + 2,
        renewal: basePrice.renewal + 3,
        url: 'https://www.godaddy.com',
        features: ['Domain Forwarding', 'DNS Management', 'Email Forwarding']
      },
      {
        registrar: 'Google Domains',
        firstYear: basePrice.firstYear + 1,
        renewal: basePrice.renewal + 1,
        url: 'https://domains.google.com',
        features: ['Free Privacy Protection', 'Google Workspace Integration', 'Simple Management']
      }
    ];
  }

  /**
   * Extract TLD from domain name
   * @param domain - Full domain name
   * @returns TLD with dot (e.g., ".com") or null
   */
  private extractTLD(domain: string): string | null {
    const parts = domain.toLowerCase().split('.');
    if (parts.length < 2) {
      return null;
    }
    return '.' + parts[parts.length - 1];
  }
}