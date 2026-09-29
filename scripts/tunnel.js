const { spawn } = require('child_process');

function startTunnel() {
    console.log('🚀 Starting localtunnel on port 8080...');

    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const tunnel = spawn(npxCmd, ['-y', 'localtunnel', '--port', '8080'], {
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe']
    });

    tunnel.stdout.on('data', (data) => {
        process.stdout.write(data.toString());
    });

    tunnel.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
    });

    tunnel.on('close', (code) => {
        console.log(`Tunnel disconnected (code ${code}). Reconnecting in 3s...`);
        setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
        console.error('Tunnel error:', err);
        setTimeout(startTunnel, 3000);
    });
}

startTunnel();
