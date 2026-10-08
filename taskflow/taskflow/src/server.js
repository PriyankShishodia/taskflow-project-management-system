const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, () => {
  console.log(`TaskFlow running on http://localhost:${config.port}  (API docs: /api/docs)`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
