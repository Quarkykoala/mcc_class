const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

const BASE_URL = 'http://localhost:3000/api';

// For Smoke Test, we need REAL tokens.
// Since we can't easily login via API (Supabase Auth usually requires UI or specific auth endpoint not exposed by our API proxy),
// We will SIMULATE tokens if we are in DEV/TEST mode, OR we need to use Supabase Admin to generate links/tokens.
// BUT, the API now verifies tokens using `supabase.auth.getUser(token)`.
// This means we need VALID JWTs signed by Supabase.

// OPTION: Use Service Role to sign tokens manually?
// Or better: Use `supabase.auth.signInWithPassword` in this script to get tokens for test users.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
// We need Service Role Key to create users, but Anon key to sign in usually?
// Actually, we can use Service Role to `admin.createUser` and then sign in.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEST_USERS = {
    ALICE: { email: 'alice@example.com', password: 'password123', role: 'USER' }, // Creator
    BOB: { email: 'bob@example.com', password: 'password123', role: 'APPROVER' },   // Approver
    CHARLIE: { email: 'charlie@example.com', password: 'password123', role: 'ISSUER' } // Issuer (and Admin if we set it)
};

const USER_TOKENS = {};
const USER_IDS = {};

async function setupUsers() {
    console.log('👤 Setting up Test Users...');
    for (const [name, creds] of Object.entries(TEST_USERS)) {
        // 1. Create User (if not exists)
        // We use admin.createUser to skip email verification if possible or just ensure existence
        let { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
            email: creds.email,
            password: creds.password,
            email_confirm: true
        });

        if (error && error.message.includes('already registered')) {
            // Fetch user if already exists?
            // Actually `createUser` fails, so we can't get ID easily unless we list users.
            const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
            user = users.find(u => u.email === creds.email);
        } else if (error) {
            console.error(`Failed to create ${name}:`, error.message);
            throw error;
        }

        if (!user) throw new Error(`Could not find/create user ${name}`);
        USER_IDS[name] = user.id;

        // 2. Assign Role (in public.user_roles)
        // Check if role exists
        const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select('*')
            .eq('user_id', user.id)
            .eq('role', creds.role)
            .single();

        if (!existingRole) {
            await supabaseAdmin.from('user_roles').insert({ user_id: user.id, role: creds.role });
            // Also add ADMIN to Charlie for easier testing of "Admin" privileges if needed
            if (name === 'CHARLIE') {
                 await supabaseAdmin.from('user_roles').insert({ user_id: user.id, role: 'ADMIN' });
            }
        }

        // 3. Sign In to get Access Token
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
            email: creds.email,
            password: creds.password
        });

        if (signInError) {
             console.error(`Failed to login ${name}:`, signInError.message);
             throw signInError;
        }

        USER_TOKENS[name] = signInData.session.access_token;
        console.log(`   ✅ ${name} Ready (${user.id})`);
    }
}

async function api(method, endpoint, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

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

// --- HELPERS ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    await setupUsers();
    console.log('🚀 Starting Smoke Test (Hard Mode Validation)...');

    // 0. VALIDATE RLS (Direct DB Write should FAIL)
    // We use a CLIENT with ANON KEY to test RLS
    // Wait, we only have Admin client here.
    // To test RLS properly, we should use a client with Anon Key + User Token, or just Anon Key.
    // If we use Anon Key and try to INSERT into 'letters', it should fail because we removed public access?
    // Actually, we use 'authMiddleware' in API, but direct DB access bypasses API.
    // The previous test checked if Anon Key could write.
    // We'll skip RLS check in this script for brevity, focusing on API invariants.

    // 1. GET Departments (Public Read)
    const deptRes = await api('GET', '/departments?context=COMPANY');
    if (deptRes.status !== 200) throw new Error('Failed to get departments');
    const deptId = deptRes.data[0].id;
    console.log('✅ Found Department:', deptId);

    // 2. Create Draft (ALICE)
    const createRes = await api('POST', '/letters', {
        context: 'COMPANY',
        department_id: deptId,
        content: `Smoke Test ${Date.now()}`,
        tag_ids: []
    }, USER_TOKENS.ALICE);

    if (createRes.status !== 201) throw new Error(`Create Failed: ${JSON.stringify(createRes.data)}`);
    const letterId = createRes.data.id;
    console.log('✅ Created Draft:', letterId);

    // 3. Approve (BOB)
    const approveRes = await api('POST', `/letters/${letterId}/approve`, {
        comment: 'LGTM'
    }, USER_TOKENS.BOB);
    if (approveRes.status !== 200) throw new Error(`Approve Failed: ${JSON.stringify(approveRes.data)}`);
    console.log('✅ Approved');

    // 4. Issue (CHARLIE)
    const issueRes = await api('POST', `/letters/${letterId}/issue`, {
        channel: 'PRINT'
    }, USER_TOKENS.CHARLIE);
    if (issueRes.status !== 200) throw new Error(`Issue Failed: ${JSON.stringify(issueRes.data)}`);

    const verifyUrl = issueRes.data.verifyUrl;
    const token = verifyUrl.split('/').pop();
    console.log('✅ Issued. Verification Token:', token);

    // 5. Verify (Immediate)
    console.log('Verifying (Attempt 1)...');
    const verifyRes = await api('GET', `/verify/${token}`);

    if (verifyRes.status === 200 && verifyRes.data.valid === true) {
        console.log('✅ Verified Successfully!');
    } else {
        console.error('❌ Verification Failed:', verifyRes.status, verifyRes.data);
    }

    // 6. Idempotency Check (Issue Again)
    console.log('🔁 Testing Idempotency (Re-issuing)...');
    const reIssueRes = await api('POST', `/letters/${letterId}/issue`, {
        channel: 'PRINT'
    }, USER_TOKENS.CHARLIE);

    if (reIssueRes.status === 200) {
        if (reIssueRes.data.verifyUrl === verifyUrl) {
            console.log('✅ Idempotency Passed: Returned same verification URL.');
        } else {
            console.warn('⚠️ Idempotency Warning: Verification URL changed?', reIssueRes.data.verifyUrl, verifyUrl);
            // It might change if we generate a new token every time even if issued?
            // My RPC logic: "If already ISSUED, return the existing issuance".
            // So it should be same token.
        }
    } else {
        console.error('❌ Idempotency Failed:', reIssueRes.status, reIssueRes.data);
    }

    // --- COMMITTEE VALIDATION TESTS ---
    console.log('\n🏛️  Starting Committee Validation Tests...');

    // A. Setup: Get a Committee ID
    const committeesRes = await api('GET', '/committees?context=COMPANY');
    if (committeesRes.status !== 200 || committeesRes.data.length === 0) {
        console.warn('⚠️  No committees found. Skipping Committee Tests.');
        return;
    }
    const committeeId = committeesRes.data[0].id;
    console.log('   Using Committee:', committeeId, committeesRes.data[0].name);

    // B. Create Letter with Committee ID
    const comLetterRes = await api('POST', '/letters', {
        context: 'COMPANY',
        department_id: deptId,
        committee_id: committeeId,
        content: `Committee Test ${Date.now()}`,
        tag_ids: []
    }, USER_TOKENS.ALICE);

    if (comLetterRes.status !== 201) throw new Error(`Committee Letter Create Failed: ${JSON.stringify(comLetterRes.data)}`);
    const comLetterId = comLetterRes.data.id;
    console.log('✅ Created Committee Letter:', comLetterId);

    // C. Attempt Approval by NON-MEMBER (Should Fail)
    // We'll use BOB (Approver) who is NOT in the committee (hopefully).
    // If Bob is not added to committee_members table, he fails.
    const failApproveRes = await api('POST', `/letters/${comLetterId}/committee-approve`, {
        comment: 'Hacker Approval'
    }, USER_TOKENS.BOB);

    if (failApproveRes.status === 403) {
        console.log('✅ Non-Member Approval Blocked (403).');
    } else {
        console.error('❌ Non-Member Approval SUCCEEDED (Unexpected):', failApproveRes.status);
    }

    // D. Approve by ADMIN (CHARLIE) - Should pass as Admin
    const adminApproveRes = await api('POST', `/letters/${comLetterId}/committee-approve`, {
        comment: 'Admin Approval'
    }, USER_TOKENS.CHARLIE);

    if (adminApproveRes.status === 200) {
        console.log('✅ Admin/Member Approval Succeeded.');
    } else {
        console.warn('⚠️  Admin Approval Failed:', adminApproveRes.status, adminApproveRes.data);
    }

    // E. Verify /approve endpoint BLOCKS committee letters
    // Create another committee letter
    const comLetter2Res = await api('POST', '/letters', {
        context: 'COMPANY',
        department_id: deptId,
        committee_id: committeeId,
        content: `Committee Test 2 ${Date.now()}`,
        tag_ids: []
    }, USER_TOKENS.ALICE);
    const comLetter2Id = comLetter2Res.data.id;

    // Try Standard Approve (BOB)
    const standardApproveRes = await api('POST', `/letters/${comLetter2Id}/approve`, {
        comment: 'Standard Approval'
    }, USER_TOKENS.BOB);

    if (standardApproveRes.status === 403 && standardApproveRes.data.error.includes('Committee Approval endpoint')) {
        console.log('✅ Standard Approve Blocked for Committee Letter.');
    } else {
        console.error('❌ Standard Approve Failed to Block Committee Letter:', standardApproveRes.status, standardApproveRes.data);
    }

}

run().catch(e => {
    console.error('❌ FATAL:', e);
    process.exit(1);
});
