import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

interface FakeGotchiNFTToken {
  id: string;
  identifier: string;
  name: string;
  artistName: string;
  editions: number;
}

interface QueryResult {
  data: {
    fakeGotchiNFTTokens: FakeGotchiNFTToken[];
  };
}

interface Collection {
  id: string;
  name: string;
  artistName: string;
  editions: number;
  tokenIds: string[];
}

// Configure these URLs from environment variables
const SUBGRAPH_URL_1 = process.env.SUBGRAPH_URL_1;
const PROD_SUBGRAPH_URL = process.env.PROD_SUBGRAPH_URL;

// GraphQL query
const query = `
  query GetFakeGotchis($first: Int!, $skip: Int!, $orderBy: String, $orderDirection: String) {
    fakeGotchiNFTTokens(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      id
      identifier
      name
      artistName
      editions
    }
  }
`;

// Fetch data with pagination
async function fetchAllData(
  subgraphUrl: string
): Promise<FakeGotchiNFTToken[]> {
  const batchSize = 1000;
  const maxResults = 50000;
  let allTokens: FakeGotchiNFTToken[] = [];
  let hasMore = true;
  let skip = 0;

  console.log(`Starting data fetch from ${subgraphUrl}`);

  while (hasMore && allTokens.length < maxResults) {
    const variables = {
      first: batchSize,
      skip: skip,
      orderBy: "identifier",
    };

    console.log(`Fetching batch: skip=${skip}, first=${batchSize}`);

    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    const result = (await response.json()) as QueryResult;
    const batch = result.data.fakeGotchiNFTTokens;

    if (batch.length === 0) {
      hasMore = false;
    } else {
      allTokens = [...allTokens, ...batch];
      skip += batch.length;
      console.log(`Fetched ${batch.length} tokens. Total: ${allTokens.length}`);
    }
  }

  return allTokens;
}

// Save data to a file
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

// Group tokens into collections
function groupIntoCollections(tokens: FakeGotchiNFTToken[]): Collection[] {
  const collections: Map<string, Collection> = new Map();

  for (const token of tokens) {
    // Create a collection key based on name and artistName
    const collectionKey = `${token.name}-${token.artistName}`;

    if (collections.has(collectionKey)) {
      // Add to existing collection
      const collection = collections.get(collectionKey)!;
      collection.editions++;
      collection.tokenIds.push(token.identifier);
    } else {
      // Create new collection
      collections.set(collectionKey, {
        id: "", // Placeholder, will be set to incremental ID later
        name: token.name,
        artistName: token.artistName,
        editions: 1,
        tokenIds: [token.identifier],
      });
    }
  }

  // Convert map to array and assign incremental IDs
  const collectionsArray = Array.from(collections.values());

  // Assign incremental IDs (1, 2, etc.)
  return collectionsArray.map((collection, index) => ({
    ...collection,
    id: (index + 1).toString(),
  }));
}

// Compare data from both sources
function findDifferences(
  data1: FakeGotchiNFTToken[],
  data2: FakeGotchiNFTToken[]
): any[] {
  const differencesMap = new Map();
  const data2Map = new Map(data2.map((item) => [item.identifier, item]));

  for (const item1 of data1) {
    const item2 = data2Map.get(item1.identifier);

    if (!item2) {
      // Token exists in source 1 but not source 2
      differencesMap.set(item1.identifier, {
        id: item1.identifier,
        differences: ["missing_in_prod"],
        subgraph1: {
          name: item1.name,
          artistName: item1.artistName,
          editions: item1.editions,
          identifier: item1.identifier,
        },
        prod: null,
      });
      continue;
    }

    // Compare all fields
    const diffFields: string[] = [];
    for (const field of ["name", "artistName", "editions"]) {
      if (
        item1[field as keyof FakeGotchiNFTToken] !==
        item2[field as keyof FakeGotchiNFTToken]
      ) {
        diffFields.push(field);
      }
    }

    if (diffFields.length > 0) {
      differencesMap.set(item1.identifier, {
        id: item1.identifier,
        differences: diffFields,
        subgraph1: {
          name: item1.name,
          artistName: item1.artistName,
          editions: item1.editions,
          identifier: item1.identifier,
        },
        prod: {
          name: item2.name,
          artistName: item2.artistName,
          editions: item2.editions,
          identifier: item2.identifier,
        },
      });
    }
  }

  // Check for tokens that exist in source 2 but not source 1
  const data1Ids = new Set(data1.map((item) => item.identifier));
  for (const item2 of data2) {
    if (!data1Ids.has(item2.identifier)) {
      differencesMap.set(item2.identifier, {
        id: item2.identifier,
        differences: ["missing_in_subgraph1"],
        subgraph1: null,
        prod: {
          name: item2.name,
          artistName: item2.artistName,
          editions: item2.editions,
          identifier: item2.identifier,
        },
      });
    }
  }

  return Array.from(differencesMap.values());
}

// Compare collections from both sources
function findCollectionDifferences(
  collections1: Collection[],
  collections2: Collection[]
): any[] {
  const differencesMap = new Map();

  // Compare collections by their sequential ID
  for (let i = 0; i < Math.max(collections1.length, collections2.length); i++) {
    const col1 = collections1[i];
    const col2 = collections2[i];
    const id = i.toString();

    // If one collection doesn't exist at this index
    if (!col1) {
      differencesMap.set(id, {
        id,
        differences: ["missing_in_subgraph1"],
        prod: {
          name: col2.name,
          artistName: col2.artistName,
          editions: col2.editions,
        },
        subgraph1: null,
      });
      continue;
    }

    if (!col2) {
      differencesMap.set(id, {
        id,
        differences: ["missing_in_prod"],
        subgraph1: {
          name: col1.name,
          artistName: col1.artistName,
          editions: col1.editions,
        },
        prod: null,
      });
      continue;
    }

    // Both collections exist, compare their properties
    const diffTypes = [];

    if (col1.name !== col2.name) {
      diffTypes.push("name");
    }

    if (col1.artistName !== col2.artistName) {
      diffTypes.push("artistName");
    }

    if (col1.editions !== col2.editions) {
      diffTypes.push("editions");
    }

    if (diffTypes.length > 0) {
      differencesMap.set(id, {
        id,
        differences: diffTypes,
        subgraph1: {
          name: col1.name,
          artistName: col1.artistName,
          editions: col1.editions,
        },
        prod: {
          name: col2.name,
          artistName: col2.artistName,
          editions: col2.editions,
        },
      });
    }
  }

  return Array.from(differencesMap.values());
}

// Process data from file
async function processDataFromFile(
  filename: string
): Promise<FakeGotchiNFTToken[]> {
  const resultsDir = path.join(process.cwd(), "results");
  const filePath = path.join(resultsDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${filePath} does not exist`);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent) as FakeGotchiNFTToken[];
}

async function main() {
  if (!SUBGRAPH_URL_1 || !PROD_SUBGRAPH_URL) {
    throw new Error(
      "SUBGRAPH_URL_1 and PROD_SUBGRAPH_URL must be set in the environment variables"
    );
  }

  try {
    let data1: FakeGotchiNFTToken[];
    let data2: FakeGotchiNFTToken[];

    // Create results directory if it doesn't exist
    const resultsDir = path.join(process.cwd(), "results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Check if data files already exist, if not fetch them
    if (fs.existsSync(path.join(resultsDir, "subgraph1_data.json"))) {
      console.log("Loading data from results/subgraph1_data.json...");
      data1 = await processDataFromFile("subgraph1_data.json");
    } else {
      console.log("Fetching data from subgraph 1...");
      data1 = await fetchAllData(SUBGRAPH_URL_1);
      saveToFile(data1, "subgraph1_data.json");
    }

    if (fs.existsSync(path.join(resultsDir, "prod_data.json"))) {
      console.log("Loading data from results/prod_data.json...");
      data2 = await processDataFromFile("prod_data.json");
    } else {
      console.log("Fetching data from subgraph 2...");
      data2 = await fetchAllData(PROD_SUBGRAPH_URL);
      saveToFile(data2, "prod_data.json");
    }

    console.log("Comparing individual tokens...");
    const differences = findDifferences(data1, data2);
    saveToFile(differences, "subgraph_differences.json");

    console.log("Grouping tokens into collections for subgraph 1...");
    const collections1 = groupIntoCollections(data1);
    saveToFile(collections1, "subgraph1_collections.json");

    console.log("Grouping tokens into collections for subgraph 2...");
    const collections2 = groupIntoCollections(data2);
    saveToFile(collections2, "prod_collections.json");

    console.log("Comparing collections...");
    const collectionDifferences = findCollectionDifferences(
      collections1,
      collections2
    );
    saveToFile(collectionDifferences, "collection_differences.json");

    console.log(
      `Found ${differences.length} token differences and ${collectionDifferences.length} collection differences`
    );
    console.log("Process completed successfully");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
