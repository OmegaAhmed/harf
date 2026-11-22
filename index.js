import express from 'express';
import serverlessHandler from './apps/api/src/serverless.js';

const app = express();

app.use(serverlessHandler);

export default app;
