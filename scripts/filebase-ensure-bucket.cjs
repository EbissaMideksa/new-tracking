// scripts/filebase-ensure-bucket.cjs
// Create the Filebase bucket (if missing) and set it public-read so browser
// avatars can be served from https://<bucket>.s3.filebase.io/<key>.
//
// Usage:
//   export $(grep -E '^FILEBASE_' .env.docker.cloud)
//   node scripts/filebase-ensure-bucket.cjs
const {
  S3Client,
  CreateBucketCommand,
  PutBucketAclCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3")

const accessKeyId     = process.env.FILEBASE_ACCESS_KEY
const secretAccessKey = process.env.FILEBASE_SECRET_KEY
const bucket          = process.env.FILEBASE_BUCKET || "asset-tracking-avatars"
if (!accessKeyId || !secretAccessKey) {
  console.error("FILEBASE_ACCESS_KEY / FILEBASE_SECRET_KEY env vars required.")
  process.exit(1)
}

;(async () => {
  const c = new S3Client({
    region: "auto",
    endpoint: "https://s3.filebase.io",
    credentials: { accessKeyId, secretAccessKey },
  })

  try {
    await c.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log(`Bucket "${bucket}" already exists.`)
  } catch (e) {
    if (e.name === "NoSuchBucket" || e.$metadata?.httpStatusCode === 404) {
      console.log(`Creating bucket "${bucket}"...`)
      await c.send(new CreateBucketCommand({ Bucket: bucket }))
      console.log("Created.")
    } else {
      console.error("HeadBucket failed:", e.name, e.message)
      process.exit(1)
    }
  }

  try {
    await c.send(new PutBucketAclCommand({ Bucket: bucket, ACL: "public-read" }))
    console.log('Set bucket ACL to "public-read".')
  } catch (e) {
    console.error("PutBucketAcl failed:", e.name, e.message)
  }
})()
