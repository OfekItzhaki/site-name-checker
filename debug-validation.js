const { InputValidator } = require('./dist/validators/InputValidator');

const validator = new InputValidator();

// Test the exact scenario from the failing test
function testDomainValidation(inputDomain) {
  console.log('\n=== Testing domain:', inputDomain, '===');
  
  // Extract base domain (same logic as DomainController)
  const parts = inputDomain.toLowerCase().split('.');
  console.log('Parts:', parts);
  
  let baseDomain;
  if (parts.length >= 2) {
    baseDomain = parts.slice(0, -1).join('.');
  } else {
    baseDomain = inputDomain.toLowerCase();
  }
  
  console.log('Extracted base domain:', `"${baseDomain}"`);
  console.log('Base domain length:', baseDomain.length);
  
  // Validate the base domain
  const result = validator.validateDomainName(baseDomain);
  console.log('Validation result:', JSON.stringify(result, null, 2));
  
  return result;
}

// Test various scenarios
testDomainValidation('example.com');
testDomainValidation('test.org');
testDomainValidation('invalid-domain');
testDomainValidation('');
testDomainValidation('  EXAMPLE.COM  ');