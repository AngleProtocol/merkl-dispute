import { Campaign, CampaignParameters } from "@angleprotocol/sdk";
import axios from "axios";

const MERKL_API_URL = "https://api-staging.angle.money/v3";

// TODO add retries
export async function fetchLeaves(chainId: number, root: string): Promise<any> {
  const response = await axios.get(`${MERKL_API_URL}/exports/leaves?chainId=${chainId}&root=${root}`);
  return response.data;
}

export async function fetchCampaigns(chainId: number): Promise<{ [campaignId: string]: CampaignParameters<Campaign> }> {
    const response = await axios.get(`${MERKL_API_URL}/exports/campaigns?chainId=${chainId}`);
    const campaigns: { [campaignId: string]: CampaignParameters<Campaign> } = {};
    for (const campaign of response.data) {
        campaigns[campaign.campaignId] = campaign as CampaignParameters<Campaign>;
    }
    return campaigns;
  }
