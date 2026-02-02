# Domain Availability Checker

A real-time domain availability checking application with a hybrid architecture featuring a Node.js API backend and browser-compatible frontend.

## Features

- **Real-time Domain Checking**: Check domain availability across multiple TLDs (.com, .net, .org, .ai, .dev, .io, .co)
- **Domain Pricing Information**: Get estimated registration and renewal costs for available domains
- **Hybrid Query Strategy**: Combines DNS lookups for speed with WHOIS queries for accuracy
- **Concurrent Processing**: Parallel checking of multiple TLDs for optimal performance
- **Enterprise Design Patterns**: Implements Command, Observer, Factory, Strategy, and State patterns
- **Privacy-Focused**: No data persistence or session storage
- **Responsive Interface**: Clean, modern web interface with real-time progress indicators

## Architecture

### Hybrid Architecture
- **Backend API** (Port 3001): Node.js server with TypeScript, DNS/WHOIS services, and enterprise patterns
- **Frontend Client** (Port 3002): Browser-compatible JavaScript client with API communication
- **Clean Separation**: Backend handles domain queries, frontend handles user interaction

### Design Patterns
- **Command Pattern**: Encapsulated domain check operations with retry logic
- **Observer Pattern**: Event-driven state management and progress updates
- **Factory Pattern**: Service creation and dependency injection
- **Strategy Pattern**: Pluggable query strategies (DNS, WHOIS, Hybrid)
- **State Pattern**: Application state management (Idle → Validating → Checking → Completed)

## Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Setup
```bash
# Install dependencies
npm install

# Build TypeScript code
npm run build
```

### Running the Application

#### Option 1: Start Both Servers Manually
```bash
# Terminal 1: Start API Server (Port 3001)
npm run start:api

# Terminal 2: Start Frontend Server (Port 3002)  
npm run start:frontend
```

#### Option 2: Start API Only
```bash
# Start just the API server
npm run start:api
```

### Access the Application
- **Web Interface**: http://localhost:3002
- **API Health Check**: http://localhost:3001/api/health
- **API Documentation**: See API Endpoints section below

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server health status and uptime information.

### Domain Validation
```
POST /api/validate-domain
Content-Type: application/json

{
  "domain": "example"
}
```

### Domain Availability Check
```
POST /api/check-domain  
Content-Type: application/json

{
  "baseDomain": "example",
  "tlds": [".com", ".net", ".org", ".ai", ".dev", ".io", ".co"]
}
```

### Domain Pricing Information
```
GET /api/pricing
```
Returns pricing information for all supported TLDs.

```
POST /api/domain-pricing
Content-Type: application/json

{
  "domain": "example.com"
}
```
Returns pricing information for a specific domain.

## Development

### Available Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start TypeScript compiler in watch mode
- `npm test` - Run all tests (unit, integration, property-based)
- `npm run test:unit` - Run unit tests only
- `npm run test:property` - Run property-based tests only
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run TypeScript type checking
- `npm run start:api` - Start API server on port 3001
- `npm run start:frontend` - Start frontend server on port 3002

### Testing
The project includes comprehensive testing:
- **Unit Tests**: Individual component testing
- **Property-Based Tests**: Automated test case generation with fast-check
- **Integration Tests**: End-to-end workflow testing
- **Pattern Tests**: Design pattern implementation validation

```bash
# Run all tests
npm test

# Run with coverage (90% minimum required)
npm run test:coverage
```

### Code Quality
- TypeScript strict mode compilation required
- 90% minimum test coverage
- JSDoc documentation for all public methods
- Property-based tests with 100+ iterations

## Technology Stack

### Core Technologies
- **Language**: TypeScript for type safety and modern development
- **Runtime**: Node.js for server-side operations  
- **Frontend**: HTML5, CSS3, vanilla JavaScript (no framework dependencies)
- **Architecture**: Clean layered architecture with separation of concerns

### Key Dependencies
- **DNS Queries**: Node.js built-in `dns` module
- **WHOIS Queries**: `whois` npm package for domain registration lookups
- **Testing**: Jest with fast-check for property-based testing
- **Build System**: TypeScript compiler (tsc)

## Project Structure

```
├── src/                           # TypeScript source code
│   ├── api/                       # API server and routes
│   ├── controllers/               # Domain controller orchestration  
│   ├── services/                  # DNS and WHOIS query services
│   ├── validators/                # Input validation logic
│   ├── models/                    # TypeScript interfaces and types
│   ├── patterns/                  # Design pattern implementations
│   │   ├── command/               # Command pattern for operations
│   │   ├── observer/              # Event Bus and Observer pattern
│   │   ├── factory/               # Service Factory pattern
│   │   ├── strategy/              # Query Strategy pattern
│   │   └── state/                 # State pattern for UI state management
│   └── utils/                     # Utility functions
├── public/                        # Static web assets
│   ├── index.html                 # Main HTML file
│   ├── app.js                     # Frontend JavaScript client
│   └── styles.css                 # CSS styles
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   ├── property/                  # Property-based tests  
│   ├── integration/               # Integration tests
│   └── patterns/                  # Design pattern tests
├── dist/                          # Compiled JavaScript output
└── server.js                     # Static file server for frontend
```

## Usage Examples

### Basic Domain Check
1. Open http://localhost:3002 in your browser
2. Enter a domain name (e.g., "example")
3. Click "Check Availability"
4. View results for all supported TLDs

### API Usage
```bash
# Check domain availability via API
curl -X POST http://localhost:3001/api/check-domain \
  -H "Content-Type: application/json" \
  -d '{"baseDomain": "example", "tlds": [".com", ".net", ".org"]}'

# Get pricing information for all TLDs
curl http://localhost:3001/api/pricing

# Get pricing for a specific domain
curl -X POST http://localhost:3001/api/domain-pricing \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com"}'
```

## Contributing

1. Ensure all tests pass: `npm test`
2. Maintain 90% test coverage: `npm run test:coverage`  
3. Follow TypeScript strict mode: `npm run lint`
4. Add JSDoc documentation for public methods
5. Include property-based tests for new functionality

## License

MIT License - see LICENSE file for details.