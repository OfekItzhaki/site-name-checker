const { DomainController } = require('./dist/src/controllers/DomainController.js');

async function test() {
  const controller = new DomainController();
  
  console.log('Testing domain validation...');
  
  try {
    const response = await controller.checkDomain('example.com');
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  controller.dispose();
}

test();