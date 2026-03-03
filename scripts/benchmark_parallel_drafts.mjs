import { performance } from 'perf_hooks';

// Mock function representing network latency
const mockCreateDraft = async (title) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ id: `id-${title}` });
        }, 100); // simulate 100ms network delay
    });
};

const drafts = [
    { title: 'Draft 1' },
    { title: 'Draft 2' },
    { title: 'Draft 3' },
];

async function runSequential() {
    const start = performance.now();
    const createdIds = [];
    for (const draft of drafts) {
        const created = await mockCreateDraft(draft.title);
        createdIds.push(created.id);
    }
    const end = performance.now();
    console.log(`Sequential execution took: ${(end - start).toFixed(2)}ms`);
    return createdIds;
}

async function runParallel() {
    const start = performance.now();
    const createdIds = [];

    const promises = drafts.map(draft => mockCreateDraft(draft.title));
    const results = await Promise.all(promises);

    for (const created of results) {
        if (created?.id) {
            createdIds.push(created.id);
        }
    }

    const end = performance.now();
    console.log(`Parallel execution took: ${(end - start).toFixed(2)}ms`);
    return createdIds;
}

async function main() {
    console.log('Running benchmarks...');
    await runSequential();
    await runParallel();
}

main();