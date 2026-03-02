const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/tags',
  method: 'GET'
};

const makeRequest = () => {
  return new Promise((resolve, reject) => {
    const start = process.hrtime();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const diff = process.hrtime(start);
        const timeMs = diff[0] * 1000 + diff[1] / 1000000;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          timeMs: timeMs
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
};

async function runBenchmark(numRequests) {
  console.log(`Running benchmark with ${numRequests} requests to /api/tags...`);

  let totalMs = 0;
  let hasCacheHeader = false;

  // Warm up
  await makeRequest();

  for (let i = 0; i < numRequests; i++) {
    const result = await makeRequest();
    totalMs += result.timeMs;

    if (i === 0 && result.headers['cache-control']) {
      hasCacheHeader = true;
      console.log(`Cache-Control header detected: ${result.headers['cache-control']}`);
    } else if (i === 0) {
      console.log('No Cache-Control header detected.');
    }
  }

  console.log(`\nResults:`);
  console.log(`Average Response Time (Server-Side): ${(totalMs / numRequests).toFixed(2)} ms`);
  console.log(`Note: Since Cache-Control applies to clients and CDN proxies, direct server-side latency will remain roughly the same, but the total load on the server will be drastically reduced as proxies absorb the requests.\n`);
}

runBenchmark(100).catch(console.error);
