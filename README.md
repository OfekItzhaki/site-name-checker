# Domain Availability Checker

A modern, TypeScript-based web application for checking domain availability across multiple TLDs. Built with clean architecture principles, CQRS pattern, comprehensive testing, and modern development practices.

## 🚀 Features

- **Real-time Domain Checking**: Fast availability checks across 20+ TLDs (.com, .net, .org, .ai, .dev, .io, .co, .app, .tech, .online, .store, .shop, .site, .blog, .news, .info, .biz, .me, .tv)
- **Comprehensive Pricing**: Real-time pricing information for all supported TLDs with registrar recommendations and premium domain identification
- **Single & Bulk Mode**: Check individual domains or up to 20 domains simultaneously
- **TypeScript Frontend**: Type-safe client-side application with modern ES2020+ features
- **Enhanced User Experience**: Copy-to-clipboard, export results, keyboard shortcuts (Enter, Escape, Ctrl/Cmd+K)
- **Responsive Design**: Modern tabbed interface that works seamlessly on desktop and mobile devices
- **Concurrent Processing**: Parallel TLD checking for optimal performance
- **CQRS Architecture**: Command Query Responsibility Segregation with mediator pattern
- **Enterprise Design Patterns**: Implements Command, Observer, Factory, Strategy, State, and Mediator patterns
- **Privacy-Focused**: No data persistence or session storage - completely stateless
- **Modern Interface**: Clean, accessible web interface with real-time progress indicators and favicon support

## Architecture

### CQRS Architecture with Clean Separation
- **Backend API** (Port 3001): Node.js server with TypeScript, CQRS mediator pattern, DNS/WHOIS services
- **Frontend Client** (Port 3004): Browser-compatible TypeScript client with modern UI and API communication
- **Clean Separation**: Backend handles domain queries via command/query handlers, frontend handles user interaction

### Design Patterns
- **CQRS Pattern**: Command Query Responsibility Segregation with mediator for clean separation of concerns
- **Command Pattern**: Encapsulated domain check operations with retry logic
- **Observer Pattern**: Event-driven state management and progress updates
- **Factory Pattern**: Service creation and dependency injection
- **Strategy Pattern**: Pluggable query strategies (DNS, WHOIS, Hybrid)
- **State Pattern**: Application state management (Idle → Validating → Checking → Completed)
- **Mediator Pattern**: Centralized request/response handling between UI and business logic

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
npm start

# Terminal 2: Start Frontend Server (Port 3004)  
npm run start:frontend
```

#### Option 2: Start Frontend Only (Static Mode)
```bash
# Start frontend server (Port 3004)
npm run start:frontend
```

### Access the Application
- **Web Interface**: http://localhost:3004
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
- `npm start` - Build and start the API server (Port 3001)
- `npm run build` - Build both backend and frontend
- `npm run build:backend` - Compile TypeScript backend to JavaScript
- `npm run build:frontend` - Compile TypeScript frontend to JavaScript
- `npm run dev` - Start TypeScript compiler in watch mode (backend)
- `npm run dev:frontend` - Start TypeScript compiler in watch mode (frontend)
- `npm test` - Run all tests (unit, integration, property-based)
- `npm run test:unit` - Run unit tests only
- `npm run test:property` - Run property-based tests only
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run TypeScript type checking
- `npm run start:api` - Start API server on port 3001
- `npm run start:frontend` - Start frontend server on port 3004

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
│   ├── application/               # CQRS application layer
│   │   ├── commands/              # Command definitions
│   │   ├── queries/               # Query definitions
│   │   └── handlers/              # Command and query handlers
│   ├── controllers/               # Domain controller orchestration  
│   ├── services/                  # DNS and WHOIS query services
│   ├── validators/                # Input validation logic
│   ├── models/                    # TypeScript interfaces and types
│   ├── patterns/                  # Design pattern implementations
│   │   ├── command/               # Command pattern for operations
│   │   ├── observer/              # Event Bus and Observer pattern
│   │   ├── factory/               # Service Factory pattern
│   │   ├── strategy/              # Query Strategy pattern
│   │   ├── state/                 # State pattern for UI state management
│   │   ├── mediator/              # CQRS mediator pattern
│   │   └── repository/            # Repository pattern for data access
│   └── utils/                     # Utility functions
├── public/                        # Static web assets
│   ├── index.html                 # Main HTML file
│   ├── app.ts                     # Frontend TypeScript client
│   ├── app.js                     # Compiled frontend JavaScript
│   ├── styles.css                 # CSS styles
│   ├── favicon.svg                # Favicon files
│   └── sw.js                      # Service worker for PWA
├── scripts/                       # Build and utility scripts
│   └── server.js                  # Static file server for frontend
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   ├── property/                  # Property-based tests  
│   ├── integration/               # Integration tests
│   └── patterns/                  # Design pattern tests
└── dist/                          # Compiled JavaScript output
```

## Recent Updates

### CQRS Architecture Implementation
- **Command Query Separation**: Implemented full CQRS pattern with mediator for clean separation of concerns
- **Application Layer**: Added dedicated application services with command/query handlers
- **Pricing Integration**: Real-time pricing information included in domain check results
- **Clean Startup**: Application starts with completely clean state, no residual test data

### Enhanced User Interface
- **Mode Toggle**: Single check vs Bulk check with modern tabbed interface
- **Bulk Processing**: Check up to 20 domains simultaneously with progress tracking
- **Favicon Support**: Complete favicon implementation with multiple formats (SVG, ICO, PNG)
- **Service Worker**: PWA capabilities with caching for offline functionality

### TypeScript Frontend Migration
- **Type Safety**: Converted frontend from JavaScript to TypeScript for better development experience
- **Modern Features**: Added copy-to-clipboard, export functionality, and keyboard shortcuts
- **Enhanced UX**: Temporary success/error messages with smooth animations
- **Keyboard Navigation**: Enter to submit, Escape to clear, Ctrl/Cmd+K to focus search

### Expanded TLD Support
- **20+ TLD Extensions**: Added support for .app, .tech, .online, .store, .shop, .site, .blog, .news, .info, .biz, .me, .tv
- **Comprehensive Pricing**: Detailed pricing information for all TLDs with registrar recommendations
- **Smart Categorization**: Premium vs standard TLD classification with appropriate pricing

## Usage Examples

### Basic Domain Check
1. Open http://localhost:3004 in your browser
2. Enter a domain name (e.g., "example")
3. Click "Check Availability"
4. View results for all supported TLDs with pricing information

### Bulk Domain Check
1. Click the "📋 Bulk Check" tab
2. Enter multiple domain names (one per line, up to 20)
3. Click "Process Bulk Domains"
4. View results for all domains across multiple TLDs

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

## Troubleshooting

### Common Issues

**API Connection Issues**
- Ensure the API server is running on port 3001: `npm run start:api`
- Check API health: http://localhost:3001/api/health
- Verify no other services are using port 3001

**Frontend Issues**
- Clear browser cache if styles appear broken
- Ensure frontend server is running on port 3004: `npm run start:frontend`
- Check browser console for JavaScript errors
- Press Escape key to clear all data and reset application state

**Build Issues**
- Run `npm run build` to compile TypeScript
- Ensure Node.js version is 18 or higher
- Delete `node_modules` and run `npm install` if dependency issues occur

**Test Failures**
- Ensure all dependencies are installed: `npm install`
- Run tests individually to isolate issues: `npm run test:unit`
- Check that TypeScript compilation passes: `npm run lint`

## Contributing

1. Ensure all tests pass: `npm test`
2. Maintain 90% test coverage: `npm run test:coverage`  
3. Follow TypeScript strict mode: `npm run lint`
4. Add JSDoc documentation for public methods
5. Include property-based tests for new functionality

## License

MIT License - see LICENSE file for details.