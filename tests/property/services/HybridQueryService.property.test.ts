import * as fc from 'fast-check';
import { HybridQueryService } from '../../../src/services/HybridQueryService';
import { DNSLookupService } from '../../../src/services/DNSLookupService';
import { WHOISQueryService } from '../../../src/services/WHOISQueryService';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';
import type { IDomainResult } from '../../../src/models';

// Mock the whois module first
jest.mock('whois', () => ({
  lookup: jest.fn()
}));

// Mock the underlying services
jest.mock('../../../src/services/DNSLookupService');
jest.mock('../../../src/services/WHOISQueryService');

const MockedDNSService = jest.mocked(DNSLookupService);
const MockedWHOISService = jest.mocked(WHOISQueryService);

describe('HybridQueryService Property Tests', () => {
  let service: HybridQueryService;
  let mockDnsService: jest.Mocked<DNSLookupService>;
  let mockWhoisService: jest.Mocked<WHOISQueryService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances
    mockDnsService = {
      execute: jest.fn(),
      canHandle: jest.fn(),
      getPriority: jest.fn(),
      getName: jest.fn(),
      getConfig: jest.fn(),
      setConfig: jest.fn()
    } as any;

    mockWhoisService = {
      execute: jest.fn(),
      canHandle: jest.fn(),
      getPriority: jest.fn(),
      getName: jest.fn(),
      getConfig: jest.fn(),
      setConfig: jest.fn()
    } as any;

    // Mock constructors to return our mock instances
    MockedDNSService.mockImplementation(() => mockDnsService);
    MockedWHOISService.mockImplementation(() => mockWhoisService);

    service = new HybridQueryService();
  });

  describe('Property 1: Concurrent Query Execution', () => {
    test('should execute both DNS and WHOIS queries for any valid domain', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 15 }),
            tld: fc.constantFrom('.com', '.net', '.org', '.io', '.ai')
          }),
          async ({ baseName, tld }) => {
            const domain = baseName + tld;
            
            // Mock both services to handle the domain
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            const dnsResult: IDomainResult = {
              domain,
              baseDomain: baseName,
              tld,
              status: AvailabilityStatus.AVAILABLE,
              lastChecked: new Date(),
              checkMethod: 'DNS',
              retryCount: 0,
              executionTime: 100
            };

            const whoisResult: IDomainResult = {
              domain,
              baseDomain: baseName,
              tld,
              status: AvailabilityStatus.AVAILABLE,
              lastChecked: new Date(),
              checkMethod: 'WHOIS',
              retryCount: 0,
              executionTime: 200
            };

            mockDnsService.execute.mockResolvedValue(dnsResult);
            mockWhoisService.execute.mockResolvedValue(whoisResult);

            const result = await service.execute(domain);

            // Both services should be called
            expect(mockDnsService.execute).toHaveBeenCalledWith(domain);
            expect(mockWhoisService.execute).toHaveBeenCalledWith(domain);
            
            // Result should be hybrid
            expect(result.checkMethod).toBe('HYBRID');
            expect(result.domain).toBe(domain);
            expect([AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN, AvailabilityStatus.ERROR]).toContain(result.status);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 2: Error Isolation', () => {
    test('should handle individual service failures gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            dnsSuccess: fc.boolean(),
            whoisSuccess: fc.boolean(),
            dnsStatus: fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN),
            whoisStatus: fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN)
          }).filter(({ dnsSuccess, whoisSuccess }) => dnsSuccess || whoisSuccess), // At least one should succeed
          async ({ domain, dnsSuccess, whoisSuccess, dnsStatus, whoisStatus }) => {
            const fullDomain = domain.baseName + domain.tld;
            
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            if (dnsSuccess) {
              const dnsResult: IDomainResult = {
                domain: fullDomain,
                baseDomain: domain.baseName,
                tld: domain.tld,
                status: dnsStatus,
                lastChecked: new Date(),
                checkMethod: 'DNS',
                retryCount: 0,
                executionTime: 100
              };
              mockDnsService.execute.mockResolvedValue(dnsResult);
            } else {
              mockDnsService.execute.mockRejectedValue(new Error('DNS failed'));
            }

            if (whoisSuccess) {
              const whoisResult: IDomainResult = {
                domain: fullDomain,
                baseDomain: domain.baseName,
                tld: domain.tld,
                status: whoisStatus,
                lastChecked: new Date(),
                checkMethod: 'WHOIS',
                retryCount: 0,
                executionTime: 200
              };
              mockWhoisService.execute.mockResolvedValue(whoisResult);
            } else {
              mockWhoisService.execute.mockRejectedValue(new Error('WHOIS failed'));
            }

            const result = await service.execute(fullDomain);

            // Should not fail completely if at least one service succeeds
            expect(result.status).not.toBe(AvailabilityStatus.ERROR);
            expect(result.checkMethod).toBe('HYBRID');
            
            // Should include error information for failed service
            if (!dnsSuccess) {
              expect(result.error).toContain('DNS query failed');
            }
            if (!whoisSuccess) {
              expect(result.error).toContain('WHOIS query failed');
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 3: Hybrid Status Logic Consistency', () => {
    test('should consistently apply WHOIS priority in status determination', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            dnsStatus: fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN),
            whoisStatus: fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN)
          }),
          async ({ domain, dnsStatus, whoisStatus }) => {
            const fullDomain = domain.baseName + domain.tld;
            
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            const dnsResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: dnsStatus,
              lastChecked: new Date(),
              checkMethod: 'DNS',
              retryCount: 0,
              executionTime: 100
            };

            const whoisResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: whoisStatus,
              lastChecked: new Date(),
              checkMethod: 'WHOIS',
              retryCount: 0,
              executionTime: 200
            };

            mockDnsService.execute.mockResolvedValue(dnsResult);
            mockWhoisService.execute.mockResolvedValue(whoisResult);

            const result = await service.execute(fullDomain);

            // WHOIS should take priority when both are successful
            expect(result.status).toBe(whoisStatus);
            expect(result.checkMethod).toBe('HYBRID');
          }
        ),
        { numRuns: 25 }
      );
    });

    test('should fall back to DNS when WHOIS returns ERROR', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            dnsStatus: fc.constantFrom(AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN)
          }),
          async ({ domain, dnsStatus }) => {
            const fullDomain = domain.baseName + domain.tld;
            
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            const dnsResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: dnsStatus,
              lastChecked: new Date(),
              checkMethod: 'DNS',
              retryCount: 0,
              executionTime: 100
            };

            const whoisResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: AvailabilityStatus.ERROR,
              lastChecked: new Date(),
              checkMethod: 'WHOIS',
              retryCount: 0,
              executionTime: 200,
              error: 'WHOIS server error'
            };

            mockDnsService.execute.mockResolvedValue(dnsResult);
            mockWhoisService.execute.mockResolvedValue(whoisResult);

            const result = await service.execute(fullDomain);

            // Should fall back to DNS status when WHOIS errors
            expect(result.status).toBe(dnsStatus);
            expect(result.checkMethod).toBe('HYBRID');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: Configuration Consistency', () => {
    test('should maintain configuration consistency across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            timeoutMs: fc.integer({ min: 2000, max: 20000 }),
            maxRetries: fc.integer({ min: 0, max: 5 }),
            priority: fc.integer({ min: 1, max: 10 }),
            enabled: fc.boolean()
          }),
          async (config) => {
            service.setConfig(config);
            const retrievedConfig = service.getConfig();

            // Configuration should be applied correctly
            expect(retrievedConfig.timeoutMs).toBe(config.timeoutMs);
            expect(retrievedConfig.maxRetries).toBe(config.maxRetries);
            expect(retrievedConfig.priority).toBe(config.priority);
            expect(retrievedConfig.enabled).toBe(config.enabled);

            // Priority should be reflected in getPriority()
            expect(service.getPriority()).toBe(config.priority);

            // Underlying services should receive timeout updates
            if (config.timeoutMs) {
              const expectedServiceTimeout = Math.floor(config.timeoutMs / 2);
              expect(mockDnsService.setConfig).toHaveBeenCalledWith({ timeoutMs: expectedServiceTimeout });
              expect(mockWhoisService.setConfig).toHaveBeenCalledWith({ timeoutMs: expectedServiceTimeout });
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 5: Batch Processing Consistency', () => {
    test('should process batches consistently regardless of size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 8 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            { minLength: 0, maxLength: 10 }
          ),
          async (domainSpecs) => {
            const domains = domainSpecs.map(spec => spec.baseName + spec.tld);
            
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            // Mock services to return consistent results
            mockDnsService.execute.mockImplementation((domain: string) => {
              const parts = domain.split('.');
              return Promise.resolve({
                domain,
                baseDomain: parts[0] || domain,
                tld: parts.length > 1 ? '.' + parts[1] : '',
                status: AvailabilityStatus.AVAILABLE,
                lastChecked: new Date(),
                checkMethod: 'DNS' as const,
                retryCount: 0,
                executionTime: 100
              });
            });

            mockWhoisService.execute.mockImplementation((domain: string) => {
              const parts = domain.split('.');
              return Promise.resolve({
                domain,
                baseDomain: parts[0] || domain,
                tld: parts.length > 1 ? '.' + parts[1] : '',
                status: AvailabilityStatus.AVAILABLE,
                lastChecked: new Date(),
                checkMethod: 'WHOIS' as const,
                retryCount: 0,
                executionTime: 200
              });
            });

            const results = await service.executeBatch(domains);

            // Should return same number of results as input domains
            expect(results).toHaveLength(domains.length);
            
            // Each result should correspond to input domain
            results.forEach((result, index) => {
              if (domains[index]) {
                expect(result.domain).toBe(domains[index]);
                expect(result.checkMethod).toBe('HYBRID');
              }
            });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property 6: Data Combination Consistency', () => {
    test('should consistently combine DNS and WHOIS data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            hasDnsRecords: fc.boolean(),
            hasWhoisData: fc.boolean(),
            dnsRecords: fc.array(fc.string({ minLength: 5, maxLength: 20 }), { maxLength: 3 }),
            registrar: fc.string({ minLength: 5, maxLength: 30 })
          }),
          async ({ domain, hasDnsRecords, hasWhoisData, dnsRecords, registrar }) => {
            const fullDomain = domain.baseName + domain.tld;
            
            mockDnsService.canHandle.mockReturnValue(true);
            mockWhoisService.canHandle.mockReturnValue(true);

            const dnsResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: AvailabilityStatus.AVAILABLE,
              lastChecked: new Date(),
              checkMethod: 'DNS',
              retryCount: 0,
              executionTime: 100,
              ...(hasDnsRecords && { dnsRecords })
            };

            const whoisResult: IDomainResult = {
              domain: fullDomain,
              baseDomain: domain.baseName,
              tld: domain.tld,
              status: AvailabilityStatus.AVAILABLE,
              lastChecked: new Date(),
              checkMethod: 'WHOIS',
              retryCount: 0,
              executionTime: 200,
              ...(hasWhoisData && { whoisData: { registrar } })
            };

            mockDnsService.execute.mockResolvedValue(dnsResult);
            mockWhoisService.execute.mockResolvedValue(whoisResult);

            const result = await service.execute(fullDomain);

            // Should preserve DNS records if present
            if (hasDnsRecords) {
              expect(result.dnsRecords).toEqual(dnsRecords);
            } else {
              expect(result.dnsRecords).toBeUndefined();
            }

            // Should preserve WHOIS data if present
            if (hasWhoisData) {
              expect(result.whoisData?.registrar).toBe(registrar);
            } else {
              expect(result.whoisData).toBeUndefined();
            }

            expect(result.checkMethod).toBe('HYBRID');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 7: Domain Handling Consistency', () => {
    test('should handle domains consistently based on underlying service capabilities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.string({ minLength: 1, maxLength: 50 }),
            dnsCanHandle: fc.boolean(),
            whoisCanHandle: fc.boolean()
          }),
          async ({ domain, dnsCanHandle, whoisCanHandle }) => {
            mockDnsService.canHandle.mockReturnValue(dnsCanHandle);
            mockWhoisService.canHandle.mockReturnValue(whoisCanHandle);

            const canHandle = service.canHandle(domain);

            // Should handle domain if either service can handle it
            expect(canHandle).toBe(dnsCanHandle || whoisCanHandle);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: Strategy Interface Compliance', () => {
    test('should maintain strategy interface contract', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 15 }),
              tld: fc.constantFrom('.com', '.net', '.org', '.io', '.ai')
            })
          }),
          async ({ domain }) => {
            const fullDomain = domain.baseName + domain.tld;

            // Strategy interface methods should always return consistent types
            expect(typeof service.getName()).toBe('string');
            expect(service.getName()).toBe('HybridQueryService');
            
            expect(typeof service.getPriority()).toBe('number');
            expect(service.getPriority()).toBeGreaterThan(0);
            
            expect(typeof service.canHandle(fullDomain)).toBe('boolean');
            
            const config = service.getConfig();
            expect(typeof config).toBe('object');
            expect(typeof config.timeoutMs).toBe('number');
            expect(typeof config.maxRetries).toBe('number');
            expect(typeof config.priority).toBe('number');
            expect(typeof config.enabled).toBe('boolean');

            // Performance metrics should always return valid structure
            const metrics = service.getPerformanceMetrics();
            expect(typeof metrics.totalTime).toBe('number');
            expect(typeof metrics.dnsTime).toBe('number');
            expect(typeof metrics.whoisTime).toBe('number');
            expect(typeof metrics.concurrentEfficiency).toBe('number');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});