// One-off fix for "images load on mobile but not on web": Flutter Web's
// cached_network_image fetches image bytes via a browser XHR/fetch call,
// which the browser blocks unless the R2 bucket sends CORS headers — native
// mobile HTTP clients ignore CORS entirely, which is why this only ever
// showed up on web. Presigned GET URLs are already time-limited and
// unguessable, so allowing GET/HEAD from any origin here doesn't weaken
// access control — it only lets a browser tab read the response bytes once
// it already has a valid presigned URL.
//
// Run with: npx tsx scripts/set-r2-cors.ts
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { env } from '../src/config/env.js';

async function main() {
  if (!env.CF_ACCOUNT_ID || !env.CF_ACCESS_KEY_ID || !env.CF_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new Error('Cloudflare R2 is not configured (CF_ACCOUNT_ID/CF_ACCESS_KEY_ID/CF_SECRET_ACCESS_KEY/R2_BUCKET_NAME)');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CF_ACCESS_KEY_ID,
      secretAccessKey: env.CF_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: env.R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  const result = await client.send(new GetBucketCorsCommand({ Bucket: env.R2_BUCKET_NAME }));
  console.log('R2 bucket CORS policy is now:');
  console.log(JSON.stringify(result.CORSRules, null, 2));
}

main().catch((err) => {
  console.error('Failed to set R2 bucket CORS policy:', err);
  process.exit(1);
});
