import type { AvailabilityStatus } from './AvailabilityStatus';

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
}