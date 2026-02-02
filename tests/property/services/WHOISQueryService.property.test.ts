import * as fc from 'fast-check';
import { WHOISQueryService } from '../../../src/services/WHOISQueryService';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';

// Mock the whois module
jest.mock('whois', () => ({
  lookup: jest.fn()
}));

const mockWhoisLookup = jest.mocked(require('whois').lookup);

describe('WHOISQueryService Property Tests', () => {
  let service: WHOISQueryService;

  beforeEach(() => {
    service = new WHOISQueryService();
    jest.clearAllMocks();
    // Don't use fake timers for WHOIS property tests as they involve real async operations
  });

  afterEach(() => {
    // No timer cleanup needed
  });

  describe('Property 1: Domain Input Validation', () => {
    test('should handle any valid domain format consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 1, maxLength: 20 }),
            tld: fc.constantFrom('.com', '.net', '.org', '.io', '.ai', '.dev', '.co')
          }).filter(({ baseName }) => 
            baseName.length > 0 && 
            !baseName.startsWith('-') && 
            !baseName.endsWith('-') &&
            !/--/.test(baseName) &&
            !/^\d+$/.test(baseName)
          ),
          async ({ baseName, tld }) => {
            const domain = baseName + tld;
            
            // Mock successful WHOIS response
            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(null, 'No match found');
            });

            const result = await service.execute(domain);

            // All valid domains should produce consistent results
            expect(result.domain).toBe(domain);
            expect(result.baseDomain).toBe(baseName);
            expect(result.tld).toBe(tld);
            expect(result.checkMethod).toBe('WHOIS');
            expect(result.lastChecked).toBeInstanceOf(Date);
            expect(typeof result.executionTime).toBe('number');
            expect(result.executionTime).toBeGreaterThanOrEqual(0);
            expect([AvailabilityStatus.AVAILABLE, AvailabilityStatus.TAKEN, AvailabilityStatus.ERROR]).toContain(result.status);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('should reject invalid domain formats consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(''), // Empty string
            fc.constant('.'), // Just dot
            fc.constant('..'), // Double dots
            fc.string().filter(s => s.includes('..')), // Contains double dots
            fc.string().filter(s => s.startsWith('.')), // Starts with dot
            fc.string().filter(s => s.endsWith('.')), // Ends with dot
            fc.stringOf(fc.char(), { minLength: 254 }) // Too long
          ),
          async (invalidDomain) => {
            const canHandle = service.canHandle(invalidDomain);
            
            if (!canHandle) {
              const result = await service.execute(invalidDomain);
              expect(result.status).toBe(AvailabilityStatus.ERROR);
              expect(result.error).toBe('Invalid domain format');
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 2: WHOIS Response Parsing Consistency', () => {
    test('should consistently parse available domain indicators', async () => {
      const availableIndicators = [
        'no match', 'not found', 'no entries found', 'no data found',
        'available', 'not registered', 'no matching record',
        'status: available', 'domain status: no object found'
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 15 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            indicator: fc.constantFrom(...availableIndicators),
            prefix: fc.string({ maxLength: 50 }),
            suffix: fc.string({ maxLength: 50 })
          }),
          async ({ domain, indicator, prefix, suffix }) => {
            const fullDomain = domain.baseName + domain.tld;
            const whoisResponse = `${prefix} ${indicator} ${suffix}`;

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(null, whoisResponse);
            });

            const result = await service.execute(fullDomain);

            // Any response containing availability indicators should be marked as AVAILABLE
            expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
            expect(result.domain).toBe(fullDomain);
          }
        ),
        { numRuns: 25 }
      );
    });

    test('should consistently parse taken domain indicators', async () => {
      const takenIndicators = [
        'registrar:', 'creation date:', 'created:', 'registered:',
        'domain status: ok', 'domain status: active',
        'registry expiry date:', 'expiry date:', 'expires:'
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 15 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            indicator: fc.constantFrom(...takenIndicators),
            value: fc.string({ minLength: 1, maxLength: 50 }),
            additionalData: fc.string({ maxLength: 100 })
          }),
          async ({ domain, indicator, value, additionalData }) => {
            const fullDomain = domain.baseName + domain.tld;
            const whoisResponse = `${indicator} ${value}\n${additionalData}`;

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(null, whoisResponse);
            });

            const result = await service.execute(fullDomain);

            // Any response containing taken indicators should be marked as TAKEN
            expect(result.status).toBe(AvailabilityStatus.TAKEN);
            expect(result.domain).toBe(fullDomain);
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 3: Rate Limiting Behavior', () => {
    test('should maintain consistent rate limiting regardless of domain', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (domains) => {
            const rateLimitDelay = 500;
            service.setRateLimitDelay(rateLimitDelay);

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              // Use immediate callback for faster testing
              callback(null, 'No match found');
            });

            const startTime = Date.now();
            
            // Execute requests sequentially to test rate limiting
            for (const { baseName, tld } of domains) {
              await service.execute(baseName + tld);
            }

            const totalTime = Date.now() - startTime;
            const expectedMinTime = (domains.length - 1) * rateLimitDelay;

            // Should respect rate limiting for all domains
            expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime - 50); // Allow 50ms tolerance
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: Error Handling Consistency', () => {
    test('should handle WHOIS errors consistently across different domains', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 15 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            errorType: fc.constantFrom('ENOTFOUND', 'TIMEOUT', 'CONNECTION_REFUSED', 'GENERIC_ERROR')
          }),
          async ({ domain, errorType }) => {
            const fullDomain = domain.baseName + domain.tld;

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(new Error(errorType), '');
            });

            const result = await service.execute(fullDomain);

            // All WHOIS errors should result in ERROR status
            expect(result.status).toBe(AvailabilityStatus.ERROR);
            expect(result.domain).toBe(fullDomain);
            expect(result.error).toContain(errorType);
            expect(result.checkMethod).toBe('WHOIS');
            expect(result.executionTime).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    test('should handle timeout scenarios consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            timeout: fc.integer({ min: 100, max: 2000 })
          }),
          async ({ domain, timeout }) => {
            const fullDomain = domain.baseName + domain.tld;
            service.setConfig({ timeoutMs: timeout });

            mockWhoisLookup.mockImplementation((_domain: string, _callback: any) => {
              // Never call callback to simulate timeout
            });

            const result = await service.execute(fullDomain);

            // All timeouts should result in ERROR status
            expect(result.status).toBe(AvailabilityStatus.ERROR);
            expect(result.error).toContain('timeout');
            expect(result.executionTime).toBeGreaterThanOrEqual(timeout - 100); // Allow some variance
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 5: Retry Logic Consistency', () => {
    test('should retry consistently regardless of domain or error type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.record({
              baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 }),
              tld: fc.constantFrom('.com', '.net', '.org')
            }),
            retries: fc.integer({ min: 1, max: 3 }),
            errorMessage: fc.string({ minLength: 5, maxLength: 20 })
          }),
          async ({ domain, retries, errorMessage }) => {
            const fullDomain = domain.baseName + domain.tld;
            service.setConfig({ maxRetries: retries });

            let attemptCount = 0;
            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              attemptCount++;
              callback(new Error(errorMessage), '');
            });

            const result = await service.execute(fullDomain);

            // Should attempt initial request + configured retries
            expect(attemptCount).toBe(retries + 1);
            expect(result.status).toBe(AvailabilityStatus.ERROR);
            expect(result.error).toContain(errorMessage);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 6: Configuration Consistency', () => {
    test('should respect configuration changes consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            timeoutMs: fc.integer({ min: 1000, max: 5000 }),
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
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 7: Domain Parsing Consistency', () => {
    test('should parse domain components consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }),
            tld: fc.constantFrom('.com', '.net', '.org', '.io', '.ai', '.dev', '.co')
          }),
          async ({ baseName, tld }) => {
            const fullDomain = baseName + tld;

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(null, 'No match found');
            });

            const result = await service.execute(fullDomain);

            // Domain parsing should be consistent
            expect(result.domain).toBe(fullDomain);
            expect(result.baseDomain).toBe(baseName);
            expect(result.tld).toBe(tld);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('should handle subdomain parsing consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            subdomain: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
            baseName: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
            tld: fc.constantFrom('.com', '.net', '.org')
          }),
          async ({ subdomain, baseName, tld }) => {
            const fullDomain = `${subdomain}.${baseName}${tld}`;

            mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
              callback(null, 'No match found');
            });

            const result = await service.execute(fullDomain);

            // Should parse subdomain correctly
            expect(result.domain).toBe(fullDomain);
            expect(result.baseDomain).toBe(`${subdomain}.${baseName}`);
            expect(result.tld).toBe(tld);
          }
        ),
        { numRuns: 25 }
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
            expect(service.getName()).toBe('WHOISQueryService');
            
            expect(typeof service.getPriority()).toBe('number');
            expect(service.getPriority()).toBeGreaterThan(0);
            
            expect(typeof service.canHandle(fullDomain)).toBe('boolean');
            
            const config = service.getConfig();
            expect(typeof config).toBe('object');
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
});