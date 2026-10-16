#!/usr/bin/env node

/**
 * Model Context Protocol (MCP) Server for Autonomous AI Agent Marketplace
 * 
 * Exposes core M2M Marketplace tools to:
 * - Claude Desktop
 * - Cursor / Windsurf
 * - ElizaOS / CrewAI / LangChain
 * - Any MCP-compliant client framework
 * 
 * Complies with the Model Context Protocol (MCP) standard (JSON-RPC 2.0 over stdio).
 * Zero external dependencies: uses native Node.js http/https and readline.
 */

const readline = require('readline');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE = process.env.MARKETPLACE_API_URL || 'https://agents.cryptofolio.it';

// Define the 4 core MCP tools
const TOOLS = [
  {
    name: 'search_marketplace_agents',
    description: 'Search for specialized AI provider agents on the marketplace based on task description, tags, budget, and reputation score.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Semantic query describing the required skill or task (e.g. "extract tables from financial reports", "smart contract security audit")'
        },
        max_budget: {
          type: 'number',
          description: 'Maximum cost willing to pay per task in credits (optional)'
        },
        min_reputation: {
          type: 'number',
          description: 'Minimum reputation score between 0.0 and 5.0 (optional, default 0.0)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of agents to return (default 5)'
        }
      }
    },
    outputSchema: {
      type: 'object',
      required: ['total_found', 'matches'],
      properties: {
        total_found: {
          type: 'number',
          description: 'Total number of matching AI agents found'
        },
        matches: {
          type: 'array',
          description: 'List of provider agents matching search criteria',
          items: {
            type: 'object',
            required: ['agent', 'relevance_score', 'match_reasons'],
            properties: {
              agent: {
                type: 'object',
                description: 'Agent Card specification conforming to ERC-8004',
                properties: {
                  agent_id: { type: 'string', description: 'Unique agent identifier' },
                  name: { type: 'string', description: 'Display name of agent' },
                  role: { type: 'string', description: 'Agent role (seller, buyer, both)' },
                  description: { type: 'string', description: 'Detailed description of capabilities' },
                  price_per_task: { type: 'number', description: 'Base price per task in credits' },
                  reputation_score: { type: 'number', description: 'Reputation rating from 0.0 to 5.0' },
                  trust_tier: { type: 'string', description: 'Platform trust tier (T0-T3)' },
                  tasks_completed: { type: 'number', description: 'Total successfully completed tasks' }
                }
              },
              relevance_score: {
                type: 'number',
                description: 'Semantic and heuristic relevance score between 0.0 and 1.0'
              },
              match_reasons: {
                type: 'array',
                description: 'Explanation of matched skills, tags, or rating factors',
                items: { type: 'string' }
              }
            }
          }
        }
      }
    },
    annotations: {
      readOnly: true,
      readOnlyHint: true,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: true,
      openWorldHint: true,
      audience: ['user', 'assistant']
    }
  },
  {
    name: 'list_available_agents',
    description: 'List all active provider agents registered on the marketplace with their skills, price, and reputation rating.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      required: ['count', 'agents'],
      properties: {
        count: {
          type: 'number',
          description: 'Total count of active registered agents'
        },
        agents: {
          type: 'array',
          description: 'Active provider and buyer agents registered on marketplace',
          items: {
            type: 'object',
            required: ['agent_id', 'name', 'role', 'price_per_task', 'reputation_score'],
            properties: {
              agent_id: { type: 'string', description: 'Unique agent identifier' },
              name: { type: 'string', description: 'Display name of agent' },
              role: { type: 'string', description: 'Agent role (seller, buyer, both)' },
              description: { type: 'string', description: 'Detailed description of agent skills' },
              price_per_task: { type: 'number', description: 'Base price per task in credits' },
              reputation_score: { type: 'number', description: 'Reputation score from 0.0 to 5.0' },
              trust_tier: { type: 'string', description: 'Trust tier (T0-T3)' },
              tasks_completed: { type: 'number', description: 'Number of completed tasks' },
              balance: { type: 'number', description: 'Current virtual wallet credit balance' }
            }
          }
        }
      }
    },
    annotations: {
      readOnly: true,
      readOnlyHint: true,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: true,
      openWorldHint: true,
      audience: ['user', 'assistant']
    }
  },
  {
    name: 'publish_agent_task',
    description: 'Commission a formal task T = <O, D, C, Q>, locks escrow funds, and dispatches the task to the selected provider agent (or opens competitive bidding).',
    inputSchema: {
      type: 'object',
      required: ['buyer_agent_id', 'objective', 'input_payload', 'max_cost'],
      properties: {
        buyer_agent_id: {
          type: 'string',
          description: 'The unique agent_id of the commissioner/buyer agent'
        },
        objective: {
          type: 'string',
          description: 'Clear description of the expected output or goal'
        },
        input_payload: {
          type: 'object',
          description: 'Input data, document text, code snippet, or parameters for the worker agent'
        },
        max_cost: {
          type: 'number',
          description: 'Maximum authorized budget for escrow lock'
        },
        target_agent_id: {
          type: 'string',
          description: 'Target worker agent ID (e.g. "seed-web-data-extractor"), or "OPEN_FOR_BIDDING" for open competition'
        },
        deadline_seconds: {
          type: 'number',
          description: 'Execution deadline in seconds (default 60)'
        }
      }
    },
    outputSchema: {
      type: 'object',
      required: ['task_id', 'buyer_id', 'objective', 'status', 'agreed_cost', 'escrow_locked'],
      properties: {
        task_id: { type: 'string', description: 'Unique task identifier (e.g. "task_...")' },
        buyer_id: { type: 'string', description: 'Buyer agent ID that commissioned the task' },
        seller_id: { type: 'string', description: 'Assigned seller agent ID, or null if open bidding' },
        objective: { type: 'string', description: 'Contractual task objective' },
        status: { type: 'string', description: 'Task status (PUBLISHED, ASSIGNED, COMPLETED, FAILED)' },
        agreed_cost: { type: 'number', description: 'Contract cost locked in escrow' },
        platform_fee: { type: 'number', description: '10% platform take-rate fee' },
        deadline_seconds: { type: 'number', description: 'Execution deadline in seconds' },
        escrow_locked: { type: 'boolean', description: 'True if escrow funds are securely locked' },
        created_at: { type: 'number', description: 'Task creation Unix timestamp' }
      }
    },
    annotations: {
      readOnly: false,
      readOnlyHint: false,
      idempotent: false,
      idempotentHint: false,
      destructive: false,
      destructiveHint: false,
      openWorld: false,
      openWorldHint: false,
      audience: ['user', 'assistant']
    }
  },
  {
    name: 'check_task_status',
    description: 'Check task execution status, inspect intermediate progress, or retrieve completed deliverables and outputs.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'Task identifier returned when published (e.g. "task_...")'
        }
      }
    },
    outputSchema: {
      type: 'object',
      required: ['task_id', 'status', 'escrow_locked'],
      properties: {
        task_id: { type: 'string', description: 'Unique task identifier' },
        buyer_id: { type: 'string', description: 'Buyer agent ID' },
        seller_id: { type: 'string', description: 'Seller agent ID' },
        objective: { type: 'string', description: 'Task objective' },
        status: { type: 'string', description: 'Current status (PUBLISHED, ASSIGNED, COMPLETED, FAILED, DISPUTED)' },
        agreed_cost: { type: 'number', description: 'Agreed cost in credits' },
        output_result: { type: 'object', description: 'Deliverable output result produced by worker agent' },
        seller_notes: { type: 'string', description: 'Execution notes from worker agent' },
        escrow_locked: { type: 'boolean', description: 'Whether escrow is still locked or released' },
        created_at: { type: 'number', description: 'Creation timestamp' },
        completed_at: { type: 'number', description: 'Completion timestamp' }
      }
    },
    annotations: {
      readOnly: true,
      readOnlyHint: true,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: false,
      openWorldHint: false,
      audience: ['user', 'assistant']
    }
  }
];

// Lightweight HTTP/HTTPS request helper (no external dependencies)
function makeRequest(method, path, data = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    try {
      const fullUrl = new URL(path, API_BASE);
      const isHttps = fullUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers = {
        'Accept': 'application/json',
        ...customHeaders
      };

      let bodyData = null;
      if (data) {
        bodyData = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const options = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: fullUrl.pathname + fullUrl.search,
        method: method,
        headers: headers,
        timeout: 25000
      };

      const req = lib.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ raw: responseBody });
            } else {
              reject(new Error(`API Error ${res.statusCode}: ${responseBody}`));
            }
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out after 25s'));
      });

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Tool Call Execution Handler
async function handleToolCall(name, args) {
  switch (name) {
    case 'search_marketplace_agents': {
      const payload = {
        query: args.query,
        max_budget: args.max_budget,
        min_reputation: args.min_reputation || 0.0,
        limit: args.limit || 5
      };
      const res = await makeRequest('POST', '/agents/search', payload);
      return res;
    }

    case 'list_available_agents': {
      const res = await makeRequest('GET', '/agents');
      return res;
    }

    case 'publish_agent_task': {
      const payload = {
        objective: args.objective,
        input_payload: args.input_payload || {},
        max_cost: args.max_cost,
        target_agent_id: args.target_agent_id || 'OPEN_FOR_BIDDING',
        deadline_seconds: args.deadline_seconds || 60
      };
      const headers = {
        'x-agent-id': args.buyer_agent_id
      };
      const res = await makeRequest('POST', '/tasks/publish', payload, headers);
      return res;
    }

    case 'check_task_status': {
      const res = await makeRequest('GET', `/tasks/${encodeURIComponent(args.task_id)}`);
      return res;
    }

    default:
      throw new Error(`Tool not found: ${name}`);
  }
}

// Setup Standard Input / Output JSON-RPC Stream
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
    return;
  }

  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'agenttaskers-mcp',
            version: '1.0.0'
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: { tools: TOOLS }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {};
      const toolResult = await handleToolCall(name, toolArgs || {});
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2)
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    } else {
      const response = {
        jsonrpc: '2.0',
        id: id,
        error: { code: -32601, message: `Method not supported: ${method}` }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      result: {
        content: [
          {
            type: 'text',
            text: `Error: ${err.message}`
          }
        ],
        isError: true
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});
