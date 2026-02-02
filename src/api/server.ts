import http from 'http';
import url from 'url';
import { DomainController } from '../controllers/DomainController';
import type { IQueryRequest } from '../models';

/**
 * API Server for Domain Availability Checker
 * Provides REST endpoints for domain checking functionality
 */
export class ApiServer {
  private server: http.Server;
  private domainController: DomainController;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.domainController = new DomainController();
    this.server = this.createServer();
  }

  private createServer(): http.Server {
    return http.createServer((req, res) => {
      // Enable CORS for browser requests
      this.setCorsHeaders(res);

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      this.handleRequest(req, res);
    });
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const parsedUrl = url.parse(req.url || '', true);
      const pathname = parsedUrl.pathname;
      const method = req.method;

      console.log(`${new Date().toISOString()} - ${method} ${pathname}`);

      // Route handling
      if (pathname === '/api/health' && method === 'GET') {
        await this.handleHealthCheck(req, res);
      } else if (pathname === '/api/check-domain' && method === 'POST') {
        await this.handleDomainCheck(req, res);
      } else if (pathname === '/api/validate-domain' && method === 'POST') {
        await this.handleDomainValidation(req, res);
      } else {
        this.sendError(res, 404, 'Endpoint not found');
      }
    } catch (error) {
      console.error('Server error:', error);
      this.sendError(res, 500, 'Internal server error');
    }
  }

  private async handleHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0'
    };

    this.sendJson(res, 200, health);
  }

  private async handleDomainCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.parseRequestBody(req);
      const request: IQueryRequest = JSON.parse(body);

      // Validate request
      if (!request.baseDomain || typeof request.baseDomain !== 'string') {
        this.sendError(res, 400, 'Invalid request: baseDomain is required');
        return;
      }

      // Process domain check using existing controller
      const response = await this.domainController.checkDomainAvailability(request);
      
      this.sendJson(res, 200, response);
    } catch (error) {
      console.error('Domain check error:', error);
      this.sendError(res, 500, 'Failed to check domain availability');
    }
  }

  private async handleDomainValidation(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.parseRequestBody(req);
      const { domain } = JSON.parse(body);

      if (!domain || typeof domain !== 'string') {
        this.sendError(res, 400, 'Invalid request: domain is required');
        return;
      }

      // Use existing validation logic
      const isValid = this.domainController.validateDomainInput(domain);
      
      this.sendJson(res, 200, { 
        domain, 
        isValid, 
        message: isValid ? 'Domain is valid' : 'Invalid domain format' 
      });
    } catch (error) {
      console.error('Domain validation error:', error);
      this.sendError(res, 500, 'Failed to validate domain');
    }
  }

  private parseRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  private sendError(res: http.ServerResponse, statusCode: number, message: string): void {
    const error = {
      error: true,
      message,
      timestamp: new Date().toISOString()
    };
    this.sendJson(res, statusCode, error);
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Domain Checker API Server running on http://localhost:${this.port}`);
        console.log(`📡 API Endpoints:`);
        console.log(`   GET  /api/health - Health check`);
        console.log(`   POST /api/check-domain - Check domain availability`);
        console.log(`   POST /api/validate-domain - Validate domain format`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('API Server stopped');
        resolve();
      });
    });
  }
}