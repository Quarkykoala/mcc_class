import dotenv from 'dotenv';

dotenv.config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'example-key';
process.env.DEMO_MODE = 'false';
