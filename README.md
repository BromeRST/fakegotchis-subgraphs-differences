# FakeGotchis Data Comparison Tool

A tool to compare FakeGotchi NFT data between different subgraphs and the blockchain contract.

## Features

- Fetches data from two different subgraphs (Base Sepolia testnet and Production)
- Groups tokens into collections based on name and artist
- Compares individual tokens and collections between subgraphs
- Queries contract metadata directly using ethers.js
- Generates detailed comparison reports
- All output files are saved in a `results` folder

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root with your subgraph URLs:

   ```
   # Required: Subgraph URLs (keep these private)
   SUBGRAPH_URL_1=your_subgraph_url_here
   PROD_SUBGRAPH_URL=your_prod_subgraph_url_here

   # Optional: Contract and RPC info (these are public)
   CONTRACT_ADDRESS=0xfE565a266760D5b23FE241D1eb6F52eeba8882E7
   RPC_PROVIDER_URL=https://sepolia.base.org
   ```

## Usage

### Compare Subgraph Data

Run the subgraph comparison script:

```bash
npm run start
```

This will:

- Fetch data from both subgraphs
- Group tokens into collections
- Compare tokens and collections
- Save all results to the `results` folder

### Compare Contract Data

Run the contract comparison script:

```bash
npm run contract
```

This will:

- Load subgraph data from previous run
- Fetch metadata directly from the smart contract
- Compare contract data with subgraph data
- Save comparison results to the `results` folder

## Output Files

All output files are saved in the `results` folder:

- `subgraph1_data.json` - Raw data from the first subgraph
- `prod_data.json` - Raw data from the production subgraph
- `subgraph1_collections.json` - Collections grouped from first subgraph
- `prod_collections.json` - Collections grouped from production subgraph
- `subgraph_differences.json` - Differences between individual tokens
- `collection_differences.json` - Differences between collections
- `contract_metadata.json` - Raw metadata from the contract
- `contract_subgraph_differences.json` - Differences between contract and subgraph data
- `contract_collections.json` - Collections derived from contract data
- `contract_collection_differences.json` - Differences between contract and subgraph collections

## Notes

- The subgraph URLs contain sensitive API tokens and should not be shared publicly
- The contract address and RPC provider URL are public information

## How It Works

1. The script fetches up to 20,000 FakeGotchi NFT tokens from each subgraph using pagination
2. Groups tokens into collections based on name and artist name
3. Compares tokens with the same IDs to find differences in name, artist name, editions, etc.
4. Compares collections between subgraphs to find differences in edition counts or missing collections
5. Records all differences to separate files for review

## Collection Structure

Collections are grouped based on tokens that share the same name and artist name. Each collection contains:

- `id`: The ID of the first token in the collection
- `name`: The collection name
- `artistName`: The artist who created the collection
- `editions`: The number of tokens in the collection
- `tokenIds`: Array of all token IDs in the collection
