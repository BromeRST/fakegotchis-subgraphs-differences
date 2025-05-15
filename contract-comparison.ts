import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface FakeGotchiNFTToken {
  id: string;
  identifier: string;
  name: string;
  artistName: string;
  editions: string;
}

interface FakeGotchiCollection {
  id: string;
  name: string;
  artistName: string;
  editions: number;
}

// We need to define the structure of the Metadata returned by the contract
// This is an approximation - we may need to adjust it based on actual contract data
interface ContractMetadata {
  name: string;
  artistName: string;
  editions: ethers.BigNumber;
  identifier: ethers.BigNumber;
  // Add other fields that might be returned by the contract
}

async function loadSubgraphData(): Promise<FakeGotchiNFTToken[]> {
  const resultsDir = path.join(process.cwd(), "results");
  const filePath = path.join(resultsDir, "subgraph1_data.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      "Subgraph data file does not exist. Run subgraph-comparison.ts first."
    );
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent) as FakeGotchiNFTToken[];
}

async function loadCollectionsData(): Promise<FakeGotchiCollection[]> {
  const resultsDir = path.join(process.cwd(), "results");
  const filePath = path.join(resultsDir, "subgraph1_collections.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      "Collections data file does not exist. Run subgraph-comparison.ts first."
    );
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent) as FakeGotchiCollection[];
}

function saveToFile(data: any, filename: string): void {
  // Ensure results directory exists
  const resultsDir = path.join(process.cwd(), "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filePath = path.join(resultsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${filePath}`);
}

// Define an ABI to interact with the contract's getMetadata function
const contractABI = [
  "function getMetadata(uint256 _id) external view returns (tuple(string name, string artistName, uint256 editions, uint256 identifier))",
];

async function fetchContractMetadata(): Promise<{
  contractData: Record<string, ContractMetadata>;
  subgraphData: FakeGotchiNFTToken[];
  collectionsData: FakeGotchiCollection[];
}> {
  // Create a provider using the RPC URL from environment variable
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_PROVIDER_URL || "https://sepolia.base.org"
  );

  // Use contract address from environment variable
  const contractAddress =
    process.env.CONTRACT_ADDRESS ||
    "0xfE565a266760D5b23FE241D1eb6F52eeba8882E7";
  const contract = new ethers.Contract(contractAddress, contractABI, provider);

  // Load collections data to know which IDs to query
  const collectionsData = await loadCollectionsData();
  const subgraphData = await loadSubgraphData();

  console.log(
    `Found ${collectionsData.length} collections and ${subgraphData.length} tokens in subgraph data`
  );

  // Fetch metadata for each collection ID
  const contractData: Record<string, ContractMetadata> = {};
  const batchSize = 10; // Smaller batch size to avoid rate limiting

  console.log("Fetching metadata from contract using collection IDs...");

  console.log("Contract:", contract);

  for (let i = 0; i < collectionsData.length; i += batchSize) {
    const batch = collectionsData.slice(i, i + batchSize);
    console.log(
      `Processing batch ${i / batchSize + 1}/${Math.ceil(
        collectionsData.length / batchSize
      )}`
    );

    // Process one at a time instead of in parallel to avoid errors
    for (const collection of batch) {
      try {
        // Use the collection ID
        const collectionId = collection.id;

        // Call the getMetadata function with collection ID
        const metadata = await contract.getMetadata(collectionId);

        // // Store the result using the collection ID as the key
        // contractData[collectionId] = metadata;
        console.log(
          `Successfully fetched metadata for collection ${collectionId}`
        );
      } catch (error: any) {
        console.error(
          `Error fetching metadata for collection ${collection.id}: ${error.message}`
        );
      }
    } // Close the inner for loop

    // Add a delay between requests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Save raw contract data
  saveToFile(contractData, "contract_metadata.json");

  return { contractData, subgraphData, collectionsData };
}

function compareData(
  contractData: Record<string, ContractMetadata>,
  collectionsData: FakeGotchiCollection[]
) {
  const differences: any[] = [];

  for (const collection of collectionsData) {
    const collectionId = collection.id;
    const contractMetadata = contractData[collectionId];

    // If we couldn't fetch this collection from the contract, skip comparison
    if (!contractMetadata) {
      differences.push({
        id: collectionId,
        differences: ["missing_in_contract"],
        subgraph: {
          name: collection.name,
          artistName: collection.artistName,
          editions: collection.editions,
        },
        contract: null,
      });
      continue;
    }

    const diffTypes: string[] = [];

    // Compare fields
    if (collection.name !== contractMetadata.name) {
      diffTypes.push("name");
    }

    if (collection.artistName !== contractMetadata.artistName) {
      diffTypes.push("artistName");
    }

    if (
      collection.editions !== parseInt(contractMetadata.editions.toString())
    ) {
      diffTypes.push("editions");
    }

    if (diffTypes.length > 0) {
      differences.push({
        id: collectionId,
        differences: diffTypes,
        subgraph: {
          name: collection.name,
          artistName: collection.artistName,
          editions: collection.editions,
        },
        contract: {
          name: contractMetadata.name,
          artistName: contractMetadata.artistName,
          editions: contractMetadata.editions.toString(),
          identifier: contractMetadata.identifier.toString(),
        },
      });
    }
  }

  return differences;
}

function compareCollectionData(
  contractData: Record<string, ContractMetadata>,
  collectionsData: FakeGotchiCollection[]
) {
  const contractCollections: Record<
    string,
    {
      name: string;
      artistName: string;
      editions: number;
      id: string;
    }
  > = {};

  // Process contract data using collection IDs directly
  Object.entries(contractData).forEach(([id, metadata]) => {
    contractCollections[id] = {
      name: metadata.name,
      artistName: metadata.artistName,
      editions: parseInt(metadata.editions.toString()),
      id,
    };
  });

  // Convert to array
  const contractCollectionsArray = Object.values(contractCollections);

  // Save contract collections data
  saveToFile(contractCollectionsArray, "contract_collections.json");

  // Compare with subgraph collections
  const differences: any[] = [];

  // Create maps for easier comparison
  const subgraphCollectionsMap = new Map(
    collectionsData.map((collection) => [collection.id, collection])
  );

  const contractCollectionsMap = new Map(
    contractCollectionsArray.map((collection) => [collection.id, collection])
  );

  // Find all unique collection IDs
  const allIds = new Set([
    ...subgraphCollectionsMap.keys(),
    ...contractCollectionsMap.keys(),
  ]);

  // Compare each collection
  allIds.forEach((id) => {
    const colFromSubgraph = subgraphCollectionsMap.get(id);
    const colFromContract = contractCollectionsMap.get(id);

    if (!colFromSubgraph) {
      differences.push({
        id,
        differences: ["missing_in_subgraph"],
        subgraph: null,
        contract: colFromContract,
      });
      return;
    }

    if (!colFromContract) {
      differences.push({
        id,
        differences: ["missing_in_contract"],
        subgraph: colFromSubgraph,
        contract: null,
      });
      return;
    }

    const diffTypes: string[] = [];

    if (colFromSubgraph.name !== colFromContract.name) {
      diffTypes.push("name");
    }

    if (colFromSubgraph.artistName !== colFromContract.artistName) {
      diffTypes.push("artistName");
    }

    if (colFromSubgraph.editions !== colFromContract.editions) {
      diffTypes.push("editions");
    }

    if (diffTypes.length > 0) {
      differences.push({
        id,
        differences: diffTypes,
        subgraph: colFromSubgraph,
        contract: colFromContract,
      });
    }
  });

  return differences;
}

async function main() {
  try {
    console.log("Starting contract data comparison using collection IDs...");

    const { contractData, subgraphData, collectionsData } =
      await fetchContractMetadata();

    console.log("Comparing collection data...");
    const collectionDifferences = compareData(contractData, collectionsData);
    saveToFile(collectionDifferences, "contract_collection_differences.json");

    console.log("Comparing aggregated collection data...");
    const aggregatedDifferences = compareCollectionData(
      contractData,
      collectionsData
    );
    saveToFile(
      aggregatedDifferences,
      "contract_collection_aggregated_differences.json"
    );

    console.log(
      `Comparison complete. Found ${collectionDifferences.length} collection differences.`
    );
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

main();
