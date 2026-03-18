import dotenv from 'dotenv';
import { resolve } from 'path';
import { app } from './app';

dotenv.config({ path: resolve(__dirname, '../.env') });

const port = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(port, () => {
        console.log(`API server running on http://localhost:${port}`);
    });
}
