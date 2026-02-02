import * as fc from 'fast-check';
import { DNSLookupService } from '../../../src/services/DNSLookupService';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';
import { promises as dns } from 'dns';

// Mock the DNS module
jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
    resolveMx: jest.fn(),
    resolveNs: jest.fn(),
    resolveTxt: jest.fn(),
    reverse: jest.fn(),
    getServers: jest.fn(),
    setServers: jest.fn()
  }
}));

const mockDns = {
  resolve4: jest.mocked(dns.resolve4),
  resolve6: jest.mocked(dns.resolve6),
  resolveMx: jest.mocked(dns.resolveMx),
  resolveNs: jest.mocked(dns.resolveNs),
  resolveTxt: jest.mocked(dns.resolveTxt),
  reverse: jest.mocked(dns.reverse),
  getServers: jest.mocked(dns.getServers),
  setServers: jest.mocked(dns.setServers)
};

describe('DNSLookupService Property Tests', () => {
  let service: DNSLookupService;

  beforeEach(() => {
    service = new DNSLookupService();
    jest.clearAllMocks();
  });

  describe('Property: Domain Validation Consistency', () => {
    test('should consistently validate domain formats', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (input) => {
            const result = service.canHandle(input);
            
            // Property: Result should be boolean
            expect(typeof result).toBe('boolean');
            
            // Property: Same input should always give same result
            expect(service.canHandle(input)).toBe(result);
            
            // Property: Valid domains should follow RFC format
            if (result === true) {
              expect(input).toMatch(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/);
              expect(input.length).toBeLessThanOrEqual(253);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should reject invalid input types consistently', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.object()
          ),
          (invalidInput) => {
            const result = service.canHandle(invalidInput as any);
            
            // Property: Non-string inputs should always be rejected
            expect(result).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: DNS Execution Result Structure', () => {
    test('should always return valid IDomainResult structure', () => {
      fc.assert(
        fc.asyncProperty(
          fc.domain(),
          async (domain) => {
            // Mock DNS responses to avoid actual network calls
            mockDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolveMx.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolveNs.mockRejectedValue(new Error('NXDOMAIN'));

            const result = await service.execute(domain);
            
            // Property: Result should have required fields
            expect(result).toHaveProperty('domain');
            expect(result).toHaveProperty('baseDomain');
            expect(result).toHaveProperty('tld');
            expect(result).toHaveProperty('status');
            expect(result).toHaveProperty('lastChecked');
            expect(result).toHaveProperty('checkMethod');
            expect(result).toHaveProperty('retryCount');
            expect(result).toHaveProperty('executionTime');
            
            // Property: Field types should be correct
            expect(typeof result.domain).toBe('string');
            expect(typeof result.baseDomain).toBe('string');
            expect(typeof result.tld).toBe('string');
            expect(Object.values(AvailabilityStatus)).toContain(result.status);
            expect(result.lastChecked).toBeInstanceOf(Date);
            expect(result.checkMethod).toBe('DNS');
            expect(typeof result.retryCount).toBe('number');
            expect(typeof result.executionTime).toBe('number');
            
            // Property: Domain should match input
            expect(result.domain).toBe(domain);
            
            // Property: Execution time should be non-negative
            expect(result.executionTime).toBeGreaterThanOrEqual(0);
            
            // Property: Retry count should be non-negative
            expect(result.retryCount).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('should handle DNS record presence correctly', () => {
      fc.assert(
        fc.asyncProperty(
          fc.domain(),
          fc.boolean(), // Whether DNS records exist
          async (domain, hasRecords) => {
            if (hasRecords) {
              // Mock successful DNS lookups
              mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
              mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
              mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
              mockDns.resolveNs.mockRejectedValue(new Error('No NS'));
            } else {
              // Mock failed DNS lookups (no records)
              mockDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
              mockDns.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
              mockDns.resolveMx.mockRejectedValue(new Error('NXDOMAIN'));
              mockDns.resolveNs.mockRejectedValue(new Error('NXDOMAIN'));
            }

            const result = await service.execute(domain);
            
            // Property: Status should correlate with DNS record presence
            if (hasRecords) {
              expect(result.status).toBe(AvailabilityStatus.TAKEN);
              expect(result.dnsRecords).toBeDefined();
              expect(Array.isArray(result.dnsRecords)).toBe(true);
            } else {
              expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
              expect(result.dnsRecords).toBeUndefined();
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property: Configuration Management', () => {
    test('should maintain configuration consistency', () => {
      fc.assert(
        fc.property(
          fc.record({
            timeoutMs: fc.integer({ min: 1000, max: 30000 }),
            maxRetries: fc.integer({ min: 0, max: 10 }),
            priority: fc.integer({ min: 1, max: 10 }),
            enabled: fc.boolean()
          }),
          (config) => {
            const originalConfig = service.getConfig();
            
            service.setConfig(config);
            const newConfig = service.getConfig();
            
            // Property: Set values should be reflected in config
            expect(newConfig.timeoutMs).toBe(config.timeoutMs);
            expect(newConfig.maxRetries).toBe(config.maxRetries);
            expect(newConfig.priority).toBe(config.priority);
            expect(newConfig.enabled).toBe(config.enabled);
            
            // Property: Config should be immutable (returns copy)
            const configCopy1 = service.getConfig();
            const configCopy2 = service.getConfig();
            expect(configCopy1).not.toBe(configCopy2);
            expect(configCopy1).toEqual(configCopy2);
            
            // Property: Partial updates should preserve other values
            service.setConfig({ timeoutMs: originalConfig.timeoutMs });
            const partialConfig = service.getConfig();
            expect(partialConfig.timeoutMs).toBe(originalConfig.timeoutMs);
            expect(partialConfig.maxRetries).toBe(config.maxRetries); // Should remain from previous set
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: Domain Parsing Consistency', () => {
    test('should parse domains consistently', () => {
      fc.assert(
        fc.asyncProperty(
          fc.domain(),
          async (domain) => {
            // Mock DNS to avoid network calls
            mockDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolveMx.mockRejectedValue(new Error('NXDOMAIN'));
            mockDns.resolveNs.mockRejectedValue(new Error('NXDOMAIN'));

            const result = await service.execute(domain);
            
            // Property: Base domain + TLD should relate to original domain
            const parts = domain.toLowerCase().split('.');
            
            if (parts.length >= 2) {
              const expectedBaseDomain = parts.slice(0, -1).join('.');
              const expectedTLD = '.' + parts[parts.length - 1];
              
              expect(result.baseDomain).toBe(expectedBaseDomain);
              expect(result.tld).toBe(expectedTLD);
            } else {
              expect(result.baseDomain).toBe(domain.toLowerCase());
              expect(result.tld).toBe('');
            }
            
            // Property: Domain parsing should be deterministic
            const result2 = await service.execute(domain);
            expect(result2.baseDomain).toBe(result.baseDomain);
            expect(result2.tld).toBe(result.tld);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: Error Handling Robustness', () => {
    test('should handle DNS errors gracefully', () => {
      fc.assert(
        fc.asyncProperty(
          fc.domain(),
          fc.oneof(
            fc.constant('ENOTFOUND'),
            fc.constant('ENODATA'), 
            fc.constant('NXDOMAIN')
          ),
          async (domain, errorType) => {
            const error = new Error(errorType);
            (error as any).code = errorType;
            
            // Mock all DNS methods to throw the same error
            mockDns.resolve4.mockRejectedValue(error);
            mockDns.resolve6.mockRejectedValue(error);
            mockDns.resolveMx.mockRejectedValue(error);
            mockDns.resolveNs.mockRejectedValue(error);

            const result = await service.execute(domain);
            
            // Property: Domain not found errors should result in AVAILABLE status
            if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(errorType)) {
              expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
            }
            
            // Property: Other fields should still be valid
            expect(result.domain).toBe(domain);
            expect(result.lastChecked).toBeInstanceOf(Date);
            expect(result.checkMethod).toBe('DNS');
            expect(typeof result.executionTime).toBe('number');
            expect(result.executionTime).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    test('should handle network errors gracefully', () => {
      fc.assert(
        fc.asyncProperty(
          fc.domain(),
          fc.oneof(
            fc.constant('ENETUNREACH'),
            fc.constant('ETIMEDOUT'),
            fc.constant('ECONNREFUSED')
          ),
          async (domain, errorType) => {
            const error = new Error('Network error');
            (error as any).code = errorType;
            
            // Mock all DNS methods to throw network errors
            mockDns.resolve4.mockRejectedValue(error);
            mockDns.resolve6.mockRejectedValue(error);
            mockDns.resolveMx.mockRejectedValue(error);
            mockDns.resolveNs.mockRejectedValue(error);

            const result = await service.execute(domain);
            
            // Property: Network errors should result in ERROR status
            expect(result.status).toBe(AvailabilityStatus.ERROR);
            
            // Property: Error message should be present
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            if (result.error) {
              expect(result.error.length).toBeGreaterThan(0);
            }
            
            // Property: Other fields should still be valid
            expect(result.domain).toBe(domain);
            expect(result.lastChecked).toBeInstanceOf(Date);
            expect(result.checkMethod).toBe('DNS');
            expect(typeof result.executionTime).toBe('number');
            expect(result.executionTime).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property: Strategy Interface Compliance', () => {
    test('should maintain strategy interface contracts', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (input) => {
            // Property: canHandle should be deterministic
            const canHandle1 = service.canHandle(input);
            const canHandle2 = service.canHandle(input);
            expect(canHandle1).toBe(canHandle2);
            
            // Property: getName should be consistent
            expect(service.getName()).toBe('DNSLookupService');
            
            // Property: getPriority should be consistent
            const priority1 = service.getPriority();
            const priority2 = service.getPriority();
            expect(priority1).toBe(priority2);
            expect(typeof priority1).toBe('number');
            
            // Property: getConfig should return valid config
            const config = service.getConfig();
            expect(config).toHaveProperty('timeout');
            expect(config).toHaveProperty('retries');
            expect(config).toHaveProperty('priority');
            expect(config).toHaveProperty('enabled');
            expect(typeof config.timeoutMs).toBe('number');
            expect(typeof config.maxRetries).toBe('number');
            expect(typeof config.priority).toBe('number');
            expect(typeof config.enabled).toBe('boolean');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: DNS Server Management', () => {
    test('should handle DNS server operations consistently', () => {
      fc.assert(
        fc.property(
          fc.array(fc.ipV4(), { minLength: 1, maxLength: 5 }),
          (servers) => {
            // Property: setDNSServers should not throw
            expect(() => service.setDNSServers(servers)).not.toThrow();
            expect(mockDns.setServers).toHaveBeenCalledWith(servers);
          }
        ),
        { numRuns: 15 }
      );
    });

    test('should handle DNS server errors gracefully', () => {
      fc.assert(
        fc.property(
          fc.constant('DNS server error'),
          (errorMessage) => {
            mockDns.setServers.mockImplementation(() => {
              throw new Error(errorMessage);
            });

            // Property: setDNSServers should not throw on error
            expect(() => service.setDNSServers(['1.1.1.1'])).not.toThrow();
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: Reverse DNS Lookup', () => {
    test('should handle reverse lookups consistently', () => {
      fc.assert(
        fc.asyncProperty(
          fc.ipV4(),
          fc.array(fc.domain(), { maxLength: 3 }),
          async (ip, hostnames) => {
            mockDns.reverse.mockResolvedValue(hostnames);

            const result = await service.reverseLookup(ip);
            
            // Property: Result should be array
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(hostnames);
            
            // Property: Should be deterministic for same input
            const result2 = await service.reverseLookup(ip);
            expect(result2).toEqual(result);
          }
        ),
        { numRuns: 15 }
      );
    });

    test('should handle reverse lookup errors gracefully', () => {
      fc.assert(
        fc.asyncProperty(
          fc.ipV4(),
          async (ip) => {
            mockDns.reverse.mockRejectedValue(new Error('No PTR record'));

            const result = await service.reverseLookup(ip);
            
            // Property: Error should result in empty array
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});