const { DomainController } = require('./dist/controllers/DomainController');

async function testDomainController() {
  console.log('Creating DomainController...');
  const controller = new DomainController();
  
  try {
    console.log('\n=== Testing example.com ===');
    const result = await controller.checkDomain('example.com');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
  
  try {
    console.log('\n=== Testing invalid-domain ===');
    const result = await controller.checkDomain('invalid-domain');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  }
  
  controller.dispose();
}

testDomainController();