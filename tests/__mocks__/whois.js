// Mock implementation of whois module for testing
const mockWhoisData = {
  'example.com': 'Domain Name: EXAMPLE.COM\nRegistry Domain ID: 2336799_DOMAIN_COM-VRSN\nRegistrar WHOIS Server: whois.iana.org\nRegistrar URL: http://res-dom.iana.org\nUpdated Date: 2012-05-17T04:20:00Z\nCreation Date: 1995-08-14T04:00:00Z\nRegistry Expiry Date: 2022-08-13T04:00:00Z\nRegistrar: RESERVED-Internet Assigned Numbers Authority\nRegistrar IANA ID: 376\nRegistrar Abuse Contact Email:\nRegistrar Abuse Contact Phone:\nDomain Status: clientDeleteProhibited https://icann.org/epp#clientDeleteProhibited\nDomain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited\nDomain Status: clientUpdateProhibited https://icann.org/epp#clientUpdateProhibited\nName Server: A.IANA-SERVERS.NET\nName Server: B.IANA-SERVERS.NET\nDNSSEC: signedDelegation\nDNSSEC DS Data: 31589 8 1 3490A6806D47F17A34C29E2CE80E8A999FFBE4BE\nDNSSEC DS Data: 31589 8 2 CDE0D742D6998AA554A92D890F8184C698CFAC8A26FA59875A990C03E576343C\nDNSSEC DS Data: 43547 8 1 B6225AB2CC613E0DCA7962BDC2342EA4F1B56083\nDNSSEC DS Data: 43547 8 2 615A64233543F66F44D68933625B17497C89A70E858ED76A2145997EDF96A918\nDNSSEC DS Data: 31406 8 1 189968811E6EBA862DD6C209F75623D8D9ED9142\nDNSSEC DS Data: 31406 8 2 F78CF3344F72137235098ECBBD08947C2C9001C7F6A085A17F518B5D8F6B916D\nURL of the ICANN Whois Inaccuracy Complaint Form: https://www.icann.org/wicf/\n>>> Last update of whois database: 2024-01-15T10:30:00Z <<<',
  'available-domain.com': 'No match for "AVAILABLE-DOMAIN.COM".',
  'error-domain.com': null // Will cause an error
};

function lookup(domain, options, callback) {
  // Handle both callback and promise styles
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const processResult = () => {
    if (domain === 'error-domain.com') {
      const error = new Error('WHOIS lookup failed');
      if (callback) {
        callback(error, null);
      } else {
        return Promise.reject(error);
      }
    } else {
      const data = mockWhoisData[domain] || mockWhoisData['available-domain.com'];
      if (callback) {
        callback(null, data);
      } else {
        return Promise.resolve(data);
      }
    }
  };

  // Simulate async behavior
  if (callback) {
    setTimeout(() => processResult(), 10);
  } else {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = processResult();
          if (result instanceof Promise) {
            result.then(resolve).catch(reject);
          } else {
            resolve(result);
          }
        } catch (error) {
          reject(error);
        }
      }, 10);
    });
  }
}

module.exports = { lookup };