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

describe('DNSLookupService', () => {
  let service: DNSLookupService;

  beforeEach(() => {
    service = new DNSLookupService();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
      expect(service.getName()).toBe('DNSLookupService');
    });

    test('should return correct priority', () => {
      expect(service.getPriority()).toBe(2);
    });

    test('should return default configuration', () => {
      const config = service.getConfig();
      expect(config).toEqual({
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 500,
        useExponentialBackoff: false,
        priority: 2,
        enabled: true
      });
    });

    test('should update configuration correctly', () => {
      service.setConfig({ timeoutMs: 3000, maxRetries: 1 });
      const config = service.getConfig();
      expect(config.timeoutMs).toBe(3000);
      expect(config.maxRetries).toBe(1);
      expect(config.priority).toBe(2); // Should remain unchanged
    });
  });

  describe('Domain Validation', () => {
    test('should handle valid domain formats', () => {
      expect(service.canHandle('example.com')).toBe(true);
      expect(service.canHandle('sub.example.org')).toBe(true);
      expect(service.canHandle('test-domain.net')).toBe(true);
      expect(service.canHandle('a.io')).toBe(true);
    });

    test('should reject invalid domain formats', () => {
      expect(service.canHandle('')).toBe(false);
      expect(service.canHandle('invalid..domain')).toBe(false);
      expect(service.canHandle('.invalid')).toBe(false);
      expect(service.canHandle('invalid.')).toBe(false);
      expect(service.canHandle('a'.repeat(254))).toBe(false); // Too long
    });

    test('should reject non-string inputs', () => {
      expect(service.canHandle(null as any)).toBe(false);
      expect(service.canHandle(undefined as any)).toBe(false);
      expect(service.canHandle(123 as any)).toBe(false);
    });
  });

  describe('DNS Lookup Execution', () => {
    test('should return AVAILABLE status when no DNS records found', async () => {
      // Mock all DNS lookups to return empty arrays (no records found)
      mockDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolveMx.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolveNs.mockRejectedValue(new Error('NXDOMAIN'));

      const result = await service.execute('available-domain.com');

      expect(result.domain).toBe('available-domain.com');
      expect(result.baseDomain).toBe('available-domain');
      expect(result.tld).toBe('.com');
      expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
      expect(result.checkMethod).toBe('DNS');
      expect(result.retryCount).toBe(0);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.lastChecked).toBeInstanceOf(Date);
      expect(result.dnsRecords).toBeUndefined();
    });

    test('should return TAKEN status when DNS records are found', async () => {
      // Mock DNS lookups to return records
      mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA records'));
      mockDns.resolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockDns.resolveNs.mockResolvedValue(['ns1.example.com']);

      const result = await service.execute('taken-domain.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual([
        'A: 192.168.1.1',
        'MX: 10 mail.example.com',
        'NS: ns1.example.com'
      ]);
    });

    test('should return ERROR status when DNS lookup fails', async () => {
      // Mock DNS lookups to throw network errors (not domain-not-found errors)
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENETUNREACH'; // Network unreachable
      
      mockDns.resolve4.mockRejectedValue(networkError);
      mockDns.resolve6.mockRejectedValue(networkError);
      mockDns.resolveMx.mockRejectedValue(networkError);
      mockDns.resolveNs.mockRejectedValue(networkError);

      const result = await service.execute('error-domain.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('Network error');
    });

    test('should handle timeout correctly', async () => {
      // Mock DNS lookups to never resolve (simulate timeout)
      mockDns.resolve4.mockImplementation(() => new Promise(() => {}));
      mockDns.resolve6.mockImplementation(() => new Promise(() => {}));
      mockDns.resolveMx.mockImplementation(() => new Promise(() => {}));
      mockDns.resolveNs.mockImplementation(() => new Promise(() => {}));

      const executePromise = service.execute('timeout-domain.com');
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(5000);
      
      const result = await executePromise;

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Domain Parsing', () => {
    test('should correctly extract base domain and TLD', async () => {
      mockDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolveMx.mockRejectedValue(new Error('NXDOMAIN'));
      mockDns.resolveNs.mockRejectedValue(new Error('NXDOMAIN'));

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

  describe('DNS Record Types', () => {
    test('should handle A records correctly', async () => {
      mockDns.resolve4.mockResolvedValue(['192.168.1.1', '192.168.1.2']);
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
      mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
      mockDns.resolveNs.mockRejectedValue(new Error('No NS'));

      const result = await service.execute('a-record.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual(['A: 192.168.1.1, 192.168.1.2']);
    });

    test('should handle AAAA records correctly', async () => {
      mockDns.resolve4.mockRejectedValue(new Error('No A'));
      mockDns.resolve6.mockResolvedValue(['2001:db8::1']);
      mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
      mockDns.resolveNs.mockRejectedValue(new Error('No NS'));

      const result = await service.execute('aaaa-record.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual(['AAAA: 2001:db8::1']);
    });

    test('should handle MX records correctly', async () => {
      mockDns.resolve4.mockRejectedValue(new Error('No A'));
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
      mockDns.resolveMx.mockResolvedValue([
        { priority: 10, exchange: 'mail1.example.com' },
        { priority: 20, exchange: 'mail2.example.com' }
      ]);
      mockDns.resolveNs.mockRejectedValue(new Error('No NS'));

      const result = await service.execute('mx-record.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual(['MX: 10 mail1.example.com, 20 mail2.example.com']);
    });

    test('should handle NS records correctly', async () => {
      mockDns.resolve4.mockRejectedValue(new Error('No A'));
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
      mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
      mockDns.resolveNs.mockResolvedValue(['ns1.example.com', 'ns2.example.com']);

      const result = await service.execute('ns-record.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual(['NS: ns1.example.com, ns2.example.com']);
    });

    test('should handle multiple record types', async () => {
      mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
      mockDns.resolve6.mockResolvedValue(['2001:db8::1']);
      mockDns.resolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockDns.resolveNs.mockResolvedValue(['ns1.example.com']);

      const result = await service.execute('multi-record.com');

      expect(result.status).toBe(AvailabilityStatus.TAKEN);
      expect(result.dnsRecords).toEqual([
        'A: 192.168.1.1',
        'AAAA: 2001:db8::1',
        'MX: 10 mail.example.com',
        'NS: ns1.example.com'
      ]);
    });
  });

  describe('DNS Server Management', () => {
    test('should set DNS servers without throwing', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      expect(() => service.setDNSServers(['1.1.1.1', '1.0.0.1'])).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    test('should handle DNS server setting errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockDns.setServers.mockImplementation(() => {
        throw new Error('Invalid DNS server');
      });

      expect(() => service.setDNSServers(['invalid'])).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to set DNS servers:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Reverse DNS Lookup', () => {
    test('should perform reverse DNS lookup successfully', async () => {
      mockDns.reverse.mockResolvedValue(['example.com', 'www.example.com']);

      const hostnames = await service.reverseLookup('192.168.1.1');

      expect(hostnames).toEqual(['example.com', 'www.example.com']);
      expect(mockDns.reverse).toHaveBeenCalledWith('192.168.1.1');
    });

    test('should handle reverse DNS lookup errors', async () => {
      mockDns.reverse.mockRejectedValue(new Error('No PTR record'));

      const hostnames = await service.reverseLookup('192.168.1.1');

      expect(hostnames).toEqual([]);
    });
  });

  describe('DNS Information Gathering', () => {
    test('should gather comprehensive DNS information', async () => {
      mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
      mockDns.resolve6.mockResolvedValue(['2001:db8::1']);
      mockDns.resolveMx.mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
      mockDns.resolveNs.mockResolvedValue(['ns1.example.com']);
      mockDns.resolveTxt.mockResolvedValue([['v=spf1 include:_spf.google.com ~all']]);

      const info = await service.getDNSInfo('example.com');

      expect(info.domain).toBe('example.com');
      expect(info.aRecords).toEqual(['192.168.1.1']);
      expect(info.aaaaRecords).toEqual(['2001:db8::1']);
      expect(info.mxRecords).toEqual(['10 mail.example.com']);
      expect(info.nsRecords).toEqual(['ns1.example.com']);
      expect(info.txtRecords).toEqual(['v=spf1 include:_spf.google.com ~all']);
      expect(info.executionTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle DNS info gathering with partial failures', async () => {
      mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
      mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
      mockDns.resolveNs.mockRejectedValue(new Error('No NS'));
      mockDns.resolveTxt.mockRejectedValue(new Error('No TXT'));
      mockDns.getServers.mockReturnValue(['8.8.8.8', '8.8.4.4']);

      const info = await service.getDNSInfo('partial.com');

      expect(info.aRecords).toEqual(['192.168.1.1']);
      expect(info.aaaaRecords).toEqual([]);
      expect(info.mxRecords).toEqual([]);
      expect(info.nsRecords).toEqual([]);
      expect(info.txtRecords).toEqual([]);
      expect(info.servers).toEqual(expect.any(Array));
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty domain gracefully', async () => {
      const result = await service.execute('');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toBe('Invalid domain format');
    });

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

    test('should handle network connectivity issues', async () => {
      const networkError = new Error('ENOTFOUND');
      (networkError as any).code = 'ENETUNREACH';
      
      mockDns.resolve4.mockRejectedValue(networkError);
      mockDns.resolve6.mockRejectedValue(networkError);
      mockDns.resolveMx.mockRejectedValue(networkError);
      mockDns.resolveNs.mockRejectedValue(networkError);

      const result = await service.execute('network-error.com');

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('Network error');
    });
  });

  describe('Performance and Timing', () => {
    test('should track execution time accurately', async () => {
      mockDns.resolve4.mockResolvedValue(['192.168.1.1']);
      mockDns.resolve6.mockRejectedValue(new Error('No AAAA'));
      mockDns.resolveMx.mockRejectedValue(new Error('No MX'));
      mockDns.resolveNs.mockRejectedValue(new Error('No NS'));
      
      const result = await service.execute('timing-test.com');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.executionTime).toBeLessThan(1000); // Should be reasonable
    });

    test('should respect custom timeout configuration', async () => {
      service.setConfig({ timeoutMs: 1000 });
      
      mockDns.resolve4.mockImplementation(() => new Promise(() => {}));
      mockDns.resolve6.mockImplementation(() => new Promise(() => {}));
      mockDns.resolveMx.mockImplementation(() => new Promise(() => {}));
      mockDns.resolveNs.mockImplementation(() => new Promise(() => {}));

      const executePromise = service.execute('custom-timeout.com');
      
      jest.advanceTimersByTime(1000);
      
      const result = await executePromise;

      expect(result.status).toBe(AvailabilityStatus.ERROR);
      expect(result.error).toContain('timeout after 1000ms');
    });
  });
});