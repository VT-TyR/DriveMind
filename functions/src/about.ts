
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from './logger';
import { execSync } from 'child_process';

let gitCommit = '';
try {
  gitCommit = execSync('git rev-parse HEAD').toString().trim();
} catch (err) {
  logger.error('Error getting git commit hash', err);
}

export const about = onRequest((request, response) => {
  logger.info('About endpoint hit');
  response.status(200).json({
    system: {
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
    },
    build: {
      git_commit: gitCommit,
      timestamp: new Date().toISOString(),
    }
  });
});
