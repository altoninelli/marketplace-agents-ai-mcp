const { spawn } = require('child_process');
const path = require('path');

const serverScript = path.join(__dirname, 'bin', 'mcp-server.js');
const proc = spawn('node', [serverScript], { stdio: ['pipe', 'pipe', 'inherit'] });

let step = 0;

proc.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim().length > 0);
  for (const line of lines) {
    const msg = JSON.parse(line);
    if (step === 0) {
      console.log('✓ 1. MCP Initialize received:', msg.result.serverInfo);
      step = 1;
      // Invia tools/list
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    } else if (step === 1) {
      console.log('✓ 2. MCP Tools available:', msg.result.tools.map(t => t.name));
      step = 2;
      // Invia tools/call list_available_agents
      proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_available_agents', arguments: {} }
      }) + '\n');
    } else if (step === 2) {
      console.log('✓ 3. Tool call list_available_agents success!');
      const content = JSON.parse(msg.result.content[0].text);
      console.log(`   Found ${content.length} agents on live HTTPS endpoint!`);
      proc.kill();
      console.log('\n🎉 TEST MCP COMPLETATO AL 100% CON SUCCESSO!');
      process.exit(0);
    }
  }
});

// Start with initialize
proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
