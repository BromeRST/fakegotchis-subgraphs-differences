import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// You'll need to provide these
const RPC_URL = "https://polygon-rpc.com"; // Polygon Mainnet
const FAKE_GOTCHI_ART_ADDRESS = "0xA4E3513c98b30d4D7cc578d2C328Bd550725D1D0";

const FAKE_GOTCHIS_NFT_FACET_ABI = [
  // Add your FakeGotchisNFTFacet ABI here
  "function totalSupply() external view returns (uint256)",
  "function batchGetMetadata(uint256[] calldata _tokenIds) external view returns (uint256[] memory)",
];

interface TokenMetadata {
  tokenId: number;
  metadataId: number;
}

async function main() {
  // Connect to the provider
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  const fakeGotchis = new ethers.Contract(
    FAKE_GOTCHI_ART_ADDRESS,
    FAKE_GOTCHIS_NFT_FACET_ABI,
    provider
  );

  // Get total supply
  const totalSupply = await fakeGotchis.totalSupply();
  console.log(`Total supply: ${totalSupply}`);

  // Calculate number of batches needed
  const batchSize = 1000;
  const totalBatches = Math.ceil(Number(totalSupply) / batchSize);

  // Array to store all metadata
  const allMetadata: TokenMetadata[] = [];

  // Process each batch
  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min((i + 1) * batchSize, Number(totalSupply));

    console.log(
      `Processing batch ${i + 1}/${totalBatches} (IDs ${start} to ${end - 1})`
    );

    // Create array of token IDs for this batch
    const tokenIds = Array.from(
      { length: end - start },
      (_, index) => start + index
    );

    // Fetch metadata for this batch
    const batchMetadata = await fakeGotchis.batchGetMetadata(tokenIds);

    // Combine tokenIds with their metadata
    const batchResults = tokenIds.map((tokenId, index) => ({
      tokenId,
      metadataId: Number(batchMetadata[index]),
    }));

    allMetadata.push(...batchResults);
    console.log(`Processed batch ${i + 1}/${totalBatches}`);
  }

  // Ensure directory exists
  const outputDir = path.join(__dirname, "results");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save to JSON file
  const outputPath = path.join(outputDir, "tokenMetadata.json");
  fs.writeFileSync(outputPath, JSON.stringify(allMetadata, null, 2));

  console.log(`Metadata saved to ${outputPath}`);
  console.log(`Total tokens processed: ${allMetadata.length}`);
}

main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
