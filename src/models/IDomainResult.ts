import type { AvailabilityStatus } from './AvailabilityStatus';

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
 * Interface representing the result of a domain availability check
 */
export interface IDomainResult {
  /** Full domain name (e.g., "synth.com") */
  domain: string;
  /** Base name without TLD (e.g., "synth") */
  baseDomain: string;
  /** Top-level domain (e.g., ".com") */
  tld: string;
  /** Current availability status */
  status: AvailabilityStatus;
  /** Timestamp when the check was last performed */
  lastChecked: Date;
  /** Method used to check availability */
  checkMethod: 'DNS' | 'WHOIS' | 'HYBRID';
  /** Error message if status is ERROR */
  error?: string;
  /** Number of retry attempts made */
  retryCount?: number;
  /** Execution time for this check in milliseconds */
  executionTime?: number;
  /** DNS records found during lookup (for DNS method) */
  dnsRecords?: string[];
  /** WHOIS data found during lookup (for WHOIS method) */
  whoisData?: {
    registrar?: string;
    expirationDate?: Date;
    registrationDate?: Date;
    nameServers?: string[];
    status?: string[];
  };
  /** Pricing information (only for available domains) */
  pricing?: IDomainPricing;
}