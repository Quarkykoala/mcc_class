const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

const BASE_URL = 'http://localhost:3000/api';
const USERS = {
    ALICE: '00000000-0000-0000-0000-000000000001', // Creator
    BOB: '00000000-0000-0000-0000-000000000002',   // Approver
    CHARLIE: '00000000-0000-0000-0000-000000000003' // Issuer/Admin
};

async function api(method, endpoint, body, userId) {
    const headers = { 'Content-Type': 'application/json' };
    if (userId) headers['x-user-id'] = userId;

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    return { status: res.status, data };
}

// --- CONFIG ---
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Note: We use the API wrapper, but for RLS validation we need the client from one of the apps.
// Try resolving from root node_modules or app node_modules
let createClient;
try {
    createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
    try {
        createClient = require('../apps/api/node_modules/@supabase/supabase-js').createClient;
    } catch (e2) {
        console.warn('⚠️  Could not load @supabase/supabase-js. Skipping Direct RLS Validation.');
    }
}

// --- HELPERS ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log('🚀 Starting Smoke Test (Hard Mode Validation)...');

    // 0. VALIDATE RLS (Direct DB Write should FAIL)
    if (createClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
        console.log('🛡️  Validating RLS (Direct DB Write with Anon Key)...');
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { error } = await supabase.from('letters').insert({
            department_id: '00000000-0000-0000-0000-000000000000', // Dummy
            content: 'HACK ATTEMPT',
            status: 'DRAFT'
        });

        if (error) {
            console.log('✅ RLS Active: Direct write blocked as expected.', error.message);
        } else {
            console.error('❌ RLS FAILURE: Direct write SUCCEEDED with Anon Key!');
            console.error('   You are NOT in Hard Mode or Migration failed.');
            process.exit(1);
        }
    } else {
        console.log('ℹ️  Skipping RLS check (Missing Supabase Lib or Env Vars).');
    }

    // 1. GET Departments (Public Read might be blocked? API should proxy)
    const deptRes = await api('GET', '/departments?context=COMPANY');
    if (deptRes.status !== 200) throw new Error('Failed to get departments');
    const deptId = deptRes.data[0].id;
    console.log('✅ Found Department:', deptId);

    // 2. Create Draft
    const createRes = await api('POST', '/letters', {
        context: 'COMPANY',
        department_id: deptId,
        content: `Smoke Test ${Date.now()}`,
        tag_ids: []
    }, USERS.ALICE);

    if (createRes.status !== 201) throw new Error(`Create Failed: ${JSON.stringify(createRes.data)}`);
    const letterId = createRes.data.id;
    console.log('✅ Created Draft:', letterId);

    // 3. Approve
    const approveRes = await api('POST', `/letters/${letterId}/approve`, {
        comment: 'LGTM'
    }, USERS.BOB);
    if (approveRes.status !== 200) throw new Error(`Approve Failed: ${JSON.stringify(approveRes.data)}`);
    console.log('✅ Approved');

    // 4. Issue
    const issueRes = await api('POST', `/letters/${letterId}/issue`, {
        channel: 'PRINT'
    }, USERS.CHARLIE);
    if (issueRes.status !== 200) throw new Error(`Issue Failed: ${JSON.stringify(issueRes.data)}`);

    const verifyUrl = issueRes.data.verifyUrl;
    const hash = verifyUrl.split('/').pop();
    console.log('✅ Issued. Hash:', hash);

    // 5. Verify (Immediate)
    console.log('Verifying (Attempt 1)...');
    const verifyRes = await api('GET', `/verify/${hash}`);

    if (verifyRes.status === 200 && verifyRes.data.valid === true) {
        console.log('✅ Verified Successfully!');
    } else {
        console.error('❌ Verification Failed:', verifyRes.status, verifyRes.data);

        // Debugging 404
        if (verifyRes.status === 404) {
            console.log('🔍 Debugging 404...');
            // Need to check specific reasons, but code implies "Record not found".
            // Is it possible the hash has whitespace?
            console.log(`Requested Hash: "${hash}"`);
            console.log(`Hash Length: ${hash.length}`);

            // Check Environment
            if (process.env.SUPABASE_ANON_KEY) {
                console.log('SUPABASE_ANON_KEY is detected.');
            } else {
                console.log('⚠️ SUPABASE_ANON_KEY missing in .env');
            }
        }
    }
}

run().catch(e => {
    console.error('❌ FATAL:', e);
    process.exit(1);
});
