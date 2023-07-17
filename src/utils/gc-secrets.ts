import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Instantiates a client
const client = new SecretManagerServiceClient();

export async function accessKeeperPrivateKeySecretVersion(isDisputeBot = false) {
  if (isDisputeBot) {
    const [version] = await client.accessSecretVersion({
      name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${process.env.GCP_DISPUTE_BOT_PK_SECRET_VERSION}/versions/latest`,
    });
    const payload = version.payload.data.toString();
    return payload;
  }
  const [version] = await client.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${process.env.GCP_KEEPER_PK_SECRET_NAME}/versions/latest`,
  });
  const payload = version.payload.data.toString();
  return payload;
}
