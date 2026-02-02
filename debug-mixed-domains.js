const { DomainController } = require('./dist/controllers/DomainController');

async function testMixedDomains() {
  const controller = new DomainController();
  
  try {
    console.log('Testing mixed valid and invalid domains...');
    const domains = ['example.com', '', 'test.org'];
    const response = await controller.checkDomains(domains);
    
    console.log('Response:', JSON.stringify(response, null, 2));
    console.log('Results count:', response.results.length);
    console.log('Errors count:', response.errors.length);
    
    if (response.errors.length > 0) {
      console.log('Error messages:');
      response.errors.forEach((error, index) => {
        console.log(`  ${index + 1}: "${error.message}"`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  controller.dispose();
}

testMixedDomains();