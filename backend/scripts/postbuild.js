const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Entrypoint template for Vercel Express preset
const entryContent = `const { createApp } = require('./backend/src/app');
const { connectDb } = require('./backend/src/db');
const { ensureCities } = require('./backend/src/services/cityService');
const { env } = require('./backend/src/config/env');

const app = createApp();

let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = connectDb().then(() => ensureCities()).catch(err => {
      console.error('[DB Init Error]', err);
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Middleware to ensure DB connection before handling requests on serverless
app.use(async (req, res, next) => {
  try {
    await getDb();
    next();
  } catch (err) {
    next(err);
  }
});

// Export the Express app for Vercel
module.exports = app;
module.exports.default = app;

// Standalone execution support
if (require.main === module) {
  getDb().then(() => {
    const port = env.PORT || process.env.PORT || 4000;
    app.listen(port, () => console.log('API listening on port ' + port));
  });
}
`;

// Write entrypoint to dist/index.js and dist/app.js
fs.writeFileSync(path.join(distDir, 'index.js'), entryContent, 'utf8');
fs.writeFileSync(path.join(distDir, 'app.js'), entryContent, 'utf8');

console.log('[postbuild] Created dist/index.js and dist/app.js for Vercel deployment');
