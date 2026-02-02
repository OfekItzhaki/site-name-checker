const { DomainCheckCommand } = require('./dist/patterns/command/DomainCheckCommand');
const { HybridQueryService } = require('./dist/services/HybridQueryService');
const { CommandInvoker } = require('./dist/patterns/command/CommandInvoker');

async function testCommand() {
  try {
    console.log('Creating HybridQueryService...');
    const strategy = new HybridQueryService();
    
    console.log('Creating DomainCheckCommand...');
    const command = new DomainCheckCommand('example.com', strategy);
    
    console.log('Creating CommandInvoker...');
    const invoker = new CommandInvoker();
    
    console.log('Executing command...');
    const result = await invoker.execute(command);
    
    console.log('Command result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error during command execution:', error);
    console.error('Stack:', error.stack);
  }
}

testCommand();