import dotenv from 'dotenv';
import { app } from './app';

dotenv.config();

const port = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(port, () => {
        console.log(`API server running on http://localhost:${port}`);
    });
}
