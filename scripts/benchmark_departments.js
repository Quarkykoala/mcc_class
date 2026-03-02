const http = require('http');

const iterations = 1000;
const concurrency = 50;
let completed = 0;
let errors = 0;

const startTime = Date.now();

function makeRequest() {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/api/departments', (res) => {
      if (res.statusCode !== 200) {
        errors++;
      }
      res.on('data', () => {});
      res.on('end', () => resolve());
    }).on('error', () => {
      errors++;
      resolve();
    });
  });
}

async function run() {
  console.log(`Starting benchmark: ${iterations} requests, concurrency ${concurrency}...`);

  for (let i = 0; i < iterations; i += concurrency) {
    const batch = [];
    for (let j = 0; j < concurrency && i + j < iterations; j++) {
      batch.push(makeRequest());
    }
    await Promise.all(batch);
    completed += batch.length;
    if (completed % 200 === 0) {
      console.log(`Completed ${completed}/${iterations}`);
    }
  }

  const duration = Date.now() - startTime;
  const rps = (iterations / (duration / 1000)).toFixed(2);
  console.log(`\nBenchmark complete.`);
  console.log(`Total Time: ${duration}ms`);
  console.log(`Requests/sec: ${rps}`);
  console.log(`Errors: ${errors}`);
}

run();
