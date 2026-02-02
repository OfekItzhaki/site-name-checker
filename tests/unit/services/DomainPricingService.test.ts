import { DomainPricingService } from '../../../src/services/DomainPricingService';

describe('DomainPricingService', () => {
  let pricingService: DomainPricingService;

  beforeEach(() => {
    pricingService = new DomainPricingService();
  });

  describe('getDomainPricing', () => {
    it('should return pricing for supported TLD', () => {
      const pricing = pricingService.getDomainPricing('example.com');
      
      expect(pricing).toBeDefined();
      expect(pricing?.domain).toBe('example.com');
      expect(pricing?.tld).toBe('.com');
      expect(pricing?.firstYearPrice).toBe(8.99);
      expect(pricing?.renewalPrice).toBe(14.99);
      expect(pricing?.registrar).toBe('Namecheap');
      expect(pricing?.isPremium).toBe(false);
    });

    it('should return pricing for premium TLD', () => {
      const pricing = pricingService.getDomainPricing('example.ai');
      
      expect(pricing).toBeDefined();
      expect(pricing?.domain).toBe('example.ai');
      expect(pricing?.tld).toBe('.ai');
      expect(pricing?.firstYearPrice).toBe(79.99);
      expect(pricing?.renewalPrice).toBe(89.99);
      expect(pricing?.isPremium).toBe(true);
    });

    it('should return null for unsupported TLD', () => {
      const pricing = pricingService.getDomainPricing('example.xyz');
      
      expect(pricing).toBeNull();
    });

    it('should return null for invalid domain', () => {
      const pricing = pricingService.getDomainPricing('invalid');
      
      expect(pricing).toBeNull();
    });
  });

  describe('getAllTLDPricing', () => {
    it('should return all supported TLD pricing', () => {
      const allPricing = pricingService.getAllTLDPricing();
      
      expect(allPricing).toHaveLength(7); // .com, .net, .org, .ai, .dev, .io, .co
      expect(allPricing.find(p => p.tld === '.com')).toBeDefined();
      expect(allPricing.find(p => p.tld === '.ai')).toBeDefined();
    });
  });

  describe('calculateMultiYearCost', () => {
    it('should calculate correct cost for single year', () => {
      const cost = pricingService.calculateMultiYearCost('example.com', 1);
      
      expect(cost).toBe(8.99);
    });

    it('should calculate correct cost for multiple years', () => {
      const cost = pricingService.calculateMultiYearCost('example.com', 3);
      
      // First year: 8.99, Next 2 years: 14.99 * 2 = 29.98, Total: 38.97
      expect(cost).toBe(38.97);
    });

    it('should return null for unsupported domain', () => {
      const cost = pricingService.calculateMultiYearCost('example.xyz', 1);
      
      expect(cost).toBeNull();
    });

    it('should return null for invalid years', () => {
      const cost = pricingService.calculateMultiYearCost('example.com', 0);
      
      expect(cost).toBeNull();
    });
  });

  describe('getPriceComparison', () => {
    it('should return price comparison for supported domain', () => {
      const comparison = pricingService.getPriceComparison('example.com');
      
      expect(comparison).toHaveLength(3); // Namecheap, GoDaddy, Google Domains
      expect(comparison[0]?.registrar).toBe('Namecheap');
      expect(comparison[1]?.registrar).toBe('GoDaddy');
      expect(comparison[2]?.registrar).toBe('Google Domains');
    });

    it('should return empty array for unsupported domain', () => {
      const comparison = pricingService.getPriceComparison('example.xyz');
      
      expect(comparison).toHaveLength(0);
    });
  });
});