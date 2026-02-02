import { WHOISQueryService } from '../../../src/services/WHOISQueryService';
import { AvailabilityStatus } from '../../../src/models/AvailabilityStatus';

// Mock the whois module
jest.mock('whois', () => ({
  lookup: jest.fn()
}));

const mockWhoisLookup = jest.mocked(require('whois').lookup);

describe('WHOISQueryService', () => {
  let service: WHOISQueryService;

  beforeEach(() => {
    service = new WHOISQueryService();
    jest.clearAllMocks();
    // Don't use fake timers for WHOIS tests as they involve real async operations
  });

  afterEach(() => {
    // No timer cleanup needed
  });

  describe('Strategy Interface Implementation', () => {
    test('should implement IQueryStrategy interface correctly', () => {
      expect(service.execute).toBeDefined();
      expect(service.canHandle).toBeDefined();
      expect(service.getPriority).toBeDefined();
      expect(service.getName).toBeDefined();
      expect(service.getConfig).toBeDefined();
      expect(service.setConfig).toBeDefined();
    });

    test('should return correct strategy name', () => {
      expect(service.getName()).toBe('WHOISQueryService');
    });

    test('should return correct priority', () => {
      expect(service.getPriority()).toBe(1);
    });

    test('should return default configuration', () => {
      const config = service.getConfig();
      expect(config).toEqual({
        timeoutMs: 10000,
        maxRetries: 3,
        retryDelayMs: 1000,
        useExponentialBackoff: true,
        priority: 1,
        enabled: true
      });
    });

    test('should update configuration correctly', () => {
      service.setConfig({ timeoutMs: 5000, maxRetries: 1 });
      const config = service.getConfig();
      expect(config.timeoutMs).toBe(5000);
      expect(config.maxRetries).toBe(1);
      expect(config.priority).toBe(1); // Should remain unchanged
    });
  });

  describe('Domain Validation and TLD Support', () => {
    test('should handle supported TLD domains', () => {
      expect(service.canHandle('example.com')).toBe(true);
      expect(service.canHandle('test.net')).toBe(true);
      expect(service.canHandle('site.org')).toBe(true);
      expect(service.canHandle('app.io')).toBe(true);
      expect(service.canHandle('service.ai')).toBe(true);
    });

    test('should reject unsupported or invalid domains', () => {
      expect(service.canHandle('invalid..domain')).toBe(false);
      expect(service.canHandle('.invalid')).toBe(false);
      expect(service.canHandle('invalid.')).toBe(false);
      expect(service.canHandle('')).toBe(false);
      expect(service.canHandle('a'.repeat(254))).toBe(false); // Too long
    });

    test('should reject non-string inputs', () => {
      expect(service.canHandle(null as any)).toBe(false);
      expect(service.canHandle(undefined as any)).toBe(false);
      expect(service.canHandle(123 as any)).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    test('should have default rate limit delay', () => {
      expect(service.getRateLimitDelay()).toBe(1000);
    });

    test('should allow setting rate limit delay', () => {
      service.setRateLimitDelay(2000);
      expect(service.getRateLimitDelay()).toBe(2000);
    });

    test('should not allow negative rate limit delay', () => {
      service.setRateLimitDelay(-500);
      expect(service.getRateLimitDelay()).toBe(0);
    });

    test('should apply rate limiting between requests', async () => {
      service.setRateLimitDelay(100); // Use shorter delay for test
      
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        setTimeout(() => callback(null, 'No match found'), 10);
      });

      const startTime = Date.now();
      
      // Make two requests
      await service.execute('test1.com');
      await service.execute('test2.com');
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should take at least the rate limit delay
      expect(totalTime).toBeGreaterThanOrEqual(100);
    }, 15000);
  });

  describe('WHOIS Lookup Execution', () => {
    test('should return AVAILABLE status for available domains', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, 'No match for "available-domain.com".');
      });

      const result = await service.execute('available-domain.com');

      expect(result.domain).toBe('available-domain.com');
      expect(result.baseDomain).toBe('available-domain');
      expect(result.tld).toBe('.com');
      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
      expect(result.checkMethod).toBe('WHOIS');
      expect(result.retryCount).toBe(0);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.lastChecked).toBeInstanceOf(Date);
    });

    test('should return TAKEN status for registered domains', async () => {
      const whoisResponse = `
        Domain Name: TAKEN-DOMAIN.COM
        Registrar: Example Registrar Inc.
        Creation Date: 2020-01-01T00:00:00Z
        Registry Expiry Date: 2025-01-01T00:00:00Z
        Domain Status: ok
      `;

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, whoisResponse);
      });

      const result = await service.execute('taken-domain.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.whoisData).toBeDefined();
      expect(result.whoisData?.registrar).toBe('Example Registrar Inc.');
      expect(result.whoisData?.expirationDate).toBeInstanceOf(Date);
    });

    test('should return ERROR status for invalid domain format', async () => {
      const result = await service.execute('');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toBe('Invalid domain format');
    });

    test('should return ERROR status when WHOIS lookup fails', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(new Error('WHOIS server error'), '');
      });

      const result = await service.execute('error-domain.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('WHOIS server error');
    });

    test('should handle timeout correctly', async () => {
      service.setConfig({ timeoutMs: 1000 });
      
      mockWhoisLookup.mockImplementation((_domain: string, _callback: any) => {
        // Never call callback to simulate timeout
      });

      const executePromise = service.execute('timeout-domain.com');
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000);
      
      const result = await executePromise;

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('timeout');
    });
  });

  describe('WHOIS Response Parsing', () => {
    test('should parse available domain responses correctly', async () => {
      const availableResponses = [
        'No match for "available.com".',
        'Not found.',
        'No entries found.',
        'No data found',
        'Available',
        'Not registered',
        'No matching record',
        'Status: Available',
        'Domain Status: No Object Found'
      ];

      for (const response of availableResponses) {
        mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
          callback(null, response);
        });

        const result = await service.execute('test.com');
        expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
      }
    });

    test('should parse taken domain responses correctly', async () => {
      const takenResponses = [
        'Registrar: Example Inc.',
        'Creation Date: 2020-01-01',
        'Created: 2020-01-01',
        'Registered: 2020-01-01',
        'Domain Status: ok',
        'Domain Status: active',
        'Registry Expiry Date: 2025-01-01',
        'Expiry Date: 2025-01-01',
        'Expires: 2025-01-01'
      ];

      for (const response of takenResponses) {
        mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
          callback(null, response);
        });

        const result = await service.execute('test.com');
        expect(result.status).toBe(AvailabilityStatus.TAKEN);
      }
    });

    test('should extract registrar information', async () => {
      const whoisResponse = 'Registrar: GoDaddy.com, LLC';

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, whoisResponse);
      });

      const result = await service.execute('test.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.whoisData?.registrar).toBe('GoDaddy.com, LLC');
    });

    test('should extract expiration date information', async () => {
      const whoisResponse = 'Registry Expiry Date: 2025-06-15T12:00:00Z';

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, whoisResponse);
      });

      const result = await service.execute('test.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.whoisData?.expirationDate).toBeInstanceOf(Date);
      expect(result.whoisData?.expirationDate?.getFullYear()).toBe(2025);
    });

    test('should handle empty WHOIS responses', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, '');
      });

      const result = await service.execute('test.com');

      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
    });

    test('should handle array responses from whois library', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, ['Line 1', 'Line 2', 'No match found'] as any);
      });

      const result = await service.execute('test.com');

      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
    });
  });

  describe('Retry Logic', () => {
    test('should retry on failure with exponential backoff', async () => {
      let attemptCount = 0;
      
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        attemptCount++;
        if (attemptCount < 3) {
          callback(new Error('Temporary failure'), '');
        } else {
          callback(null, 'No match found');
        }
      });

      const result = await service.execute('retry-test.com');

      expect(attemptCount).toBe(3);
      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
    });

    test('should fail after maximum retries', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(new Error('Persistent failure'), '');
      });

      const result = await service.execute('fail-test.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('Persistent failure');
    });

    test('should respect custom retry configuration', async () => {
      service.setConfig({ maxRetries: 1 });
      let attemptCount = 0;
      
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        attemptCount++;
        callback(new Error('Always fails'), '');
      });

      const result = await service.execute('custom-retry.com');

      expect(attemptCount).toBe(2); // Initial attempt + 1 retry
      expect(result.status).toBe(AvailabilityStatus.ERROR);
    });
  });

  describe('Domain Parsing', () => {
    test('should correctly extract base domain and TLD', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, 'No match found');
      });

      const testCases = [
        { domain: 'example.com', baseDomain: 'example', tld: '.com' },
        { domain: 'sub.example.org', baseDomain: 'sub.example', tld: '.org' },
        { domain: 'test-site.co.uk', baseDomain: 'test-site.co', tld: '.uk' },
        { domain: 'single', baseDomain: 'single', tld: '' }
      ];

      for (const testCase of testCases) {
        const result = await service.execute(testCase.domain);
        expect(result.baseDomain).toBe(testCase.baseDomain);
        expect(result.tld).toBe(testCase.tld);
      }
    });
  });

  describe('Detailed WHOIS Information', () => {
    test('should gather comprehensive WHOIS information', async () => {
      const detailedResponse = `
        Domain Name: EXAMPLE.COM
        Registrar: Example Registrar Inc.
        Creation Date: 2020-01-01T00:00:00Z
        Registry Expiry Date: 2025-01-01T00:00:00Z
        Name Server: ns1.example.com
        Name Server: ns2.example.com
        Domain Status: ok
        Domain Status: active
      `;

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, detailedResponse);
      });

      const info = await service.getDetailedWHOISInfo('example.com');

      expect(info.domain).toBe('example.com');
      expect(info.rawData).toContain('EXAMPLE.COM');
      expect(info.registrar).toBe('Example Registrar Inc.');
      expect(info.registrationDate).toBeInstanceOf(Date);
      expect(info.expirationDate).toBeInstanceOf(Date);
      expect(info.nameServers).toEqual(['ns1.example.com', 'ns2.example.com']);
      expect(info.status).toEqual(['ok', 'active']);
      expect(info.executionTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle detailed WHOIS lookup errors', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(new Error('WHOIS error'), '');
      });

      const info = await service.getDetailedWHOISInfo('error.com');

      expect(info.domain).toBe('error.com');
      expect(info.rawData).toBe('');
      expect(info.registrar).toBeUndefined();
      expect(info.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed domains', async () => {
      const malformedDomains = [
        '..invalid',
        'invalid..com',
        '-invalid.com',
        'invalid-.com'
      ];

      for (const domain of malformedDomains) {
        const result = await service.execute(domain);
        expect(result.status).toBe(AvailabilityStatus.ERROR);
        expect(result.error).toBe('Invalid domain format');
      }
    });

    test('should handle very long domains', async () => {
      const longDomain = 'a'.repeat(250) + '.com';
      const result = await service.execute(longDomain);

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toBe('Invalid domain format');
    });

    test('should handle WHOIS server connectivity issues', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(new Error('ENOTFOUND'), '');
      });

      const result = await service.execute('connectivity-test.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('ENOTFOUND');
    });

    test('should handle ambiguous WHOIS responses', async () => {
      // Response that doesn't clearly indicate available or taken
      const ambiguousResponse = 'Some random WHOIS server response without clear indicators.';

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, ambiguousResponse);
      });

      const result = await service.execute('ambiguous.com');

      // Should default to TAKEN for substantial responses
      expect(result.status).toBe(AvailabilityStatus.TAKEN);
    });

    test('should handle short ambiguous responses as error', async () => {
      const shortResponse = 'Error';

      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        callback(null, shortResponse);
      });

      const result = await service.execute('short-response.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
    });
  });

  describe('Performance and Timing', () => {
    test('should track execution time accurately', async () => {
      mockWhoisLookup.mockImplementation((_domain: string, callback: any) => {
        setTimeout(() => callback(null, 'No match found'), 100);
      });

      jest.advanceTimersByTime(100);
      
      const result = await service.execute('timing-test.com');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.executionTime).toBeLessThan(10000); // Should be reasonable
    });

    test('should respect custom timeout configuration', async () => {
      service.setConfig({ timeoutMs: 2000 });
      
      mockWhoisLookup.mockImplementation((_domain: string, _callback: any) => {
        // Never call callback to simulate timeout
      });

      const executePromise = service.execute('custom-timeout.com');
      
      jest.advanceTimersByTime(2000);
      
      const result = await executePromise;

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('timeout after 2000ms');
    });
  });
});