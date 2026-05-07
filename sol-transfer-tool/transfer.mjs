import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
	address,
	createKeyPairSignerFromBytes,
	createSolanaRpc,
	createSolanaRpcSubscriptions,
	pipe,
	createTransactionMessage,
	setTransactionMessageFeePayerSigner,
	setTransactionMessageLifetimeUsingBlockhash,
	appendTransactionMessageInstruction,
	signTransactionMessageWithSigners,
	getSignatureFromTransaction,
	getBase64EncodedWireTransaction,
	lamports,
	devnet,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

// --- Configuration ---
const RPC_URL = devnet("https://api.devnet.solana.com");
const WS_URL = devnet("wss://api.devnet.solana.com");
const LAMPORTS_PER_SOL = 1_000_000_000n;

// --- Helper: Status Update ---
function statusUpdate(message) {
	process.stdout.clearLine(0);
	process.stdout.cursorTo(0);
	process.stdout.write(message);
}

// --- Helper: Wait for Commitment ---
const COMMITMENT_LEVELS = ["processed", "confirmed", "finalized"];

async function waitForCommitment(rpc, signature, targetCommitment) {
	const targetIndex = COMMITMENT_LEVELS.indexOf(targetCommitment);

	while (true) {
		const { value } = await rpc
			.getSignatureStatuses([signature], { searchTransactionHistory: true })
			.send();

		const status = value[0];

		if (status?.err) {
			throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
		}

		if (status) {
			const currentIndex = COMMITMENT_LEVELS.indexOf(status.confirmationStatus);
			if (currentIndex >= targetIndex) break;
		}

		await new Promise((r) => setTimeout(r, 500));
	}
}

// --- Helper: Transfer with Confirmation ---
async function transferWithConfirmation(rpc, signer, toAddress, amountInSOL) {
	const destination = address(toAddress);
	const lamportAmount = lamports(BigInt(Math.round(amountInSOL * 1_000_000_000)));

	const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

	const transactionMessage = pipe(
		createTransactionMessage({ version: 0 }),
		(tx) => setTransactionMessageFeePayerSigner(signer, tx),
		(tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
		(tx) =>	appendTransactionMessageInstruction(
				getTransferSolInstruction({
					source: signer,
					destination,
					amount: lamportAmount,
				}),
				tx
			)
	);

	const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
	const signature = getSignatureFromTransaction(signedTransaction);
	const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);

	console.log(`\nSending ${amountInSOL} SOL to ${toAddress}...\n`);

	statusUpdate("Status: Sending transaction...");
	await rpc.sendTransaction(wireTransaction, { encoding: "base64" }).send();

	statusUpdate("Status: Processed (included in a block)...");

	await waitForCommitment(rpc, signature, "confirmed");
	statusUpdate("Status: Confirmed (supermajority voted)...");

	await waitForCommitment(rpc, signature, "finalized");
	statusUpdate("Status: Finalized (irreversible)");

	console.log("\n");
	return signature;
}

// --- Parse command-line arguments ---
const args = process.argv.slice(2);
if (args.length < 2) {
	console.error("Usage: node transfer.mjs <RECIPIENT_ADDRESS> <AMOUNT_IN_SOL>");
	process.exit(1);
}

const recipientAddress = address(args[0]);
const solAmount = parseFloat(args[1]);

async function loadKeypair() {
	const keypairPath = resolve(homedir(), ".config", "solana", "id.json");
	const secretKeyJson = await readFile(keypairPath, "utf-8");
	const secretKeyBytes = new Uint8Array(JSON.parse(secretKeyJson));
	return await createKeyPairSignerFromBytes(secretKeyBytes);
}

async function main() {
	console.log("Solana Transfer Tool");
	console.log("====================\n");

	const rpc = createSolanaRpc(RPC_URL);
	const sender = await loadKeypair();

	console.log("Sender:", sender.address);
	console.log("Recipient:", recipientAddress.toString());
	console.log("Amount:", solAmount, "SOL\n");

	try {
		const signature = await transferWithConfirmation(rpc, sender, recipientAddress, solAmount);
		
		console.log("Transaction successful!");
		console.log(`Signature: ${signature}`);
		console.log(`View on Solana Explorer:`);
		console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
	} catch (error) {
		console.error("\nTransaction failed:");
		console.error(error.message);
		process.exit(1);
	}
}

main();