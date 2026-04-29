import { createSolanaRpc, devnet, address } from "@solana/kit";

const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"));
const addressInput = document.getElementById("addressInput");
const fetchBtn = document.getElementById("fetchBtn");
const resultsDiv = document.getElementById("results");
const errorDiv = document.getElementById("error");
const loadingDiv = document.getElementById("loading");

fetchBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";
  resultsDiv.innerHTML = "";
  loadingDiv.textContent = "Fetching...";

  try {
    const targetAddress = address(addressInput.value.trim());

    // Fetch balance (same as Day 8)
    const { value: balanceInLamports } = await rpc
      .getBalance(targetAddress)
      .send();
    const balanceInSol = Number(balanceInLamports) / 1_000_000_000;

    // Fetch recent transactions (same as Day 9)
    const signatures = await rpc
      .getSignaturesForAddress(targetAddress, { limit: 5 })
      .send();

    // Render balance
    let html = `${balanceInSol} SOL`;
    html += `<h3>Recent transactions</h3>`;

    if (signatures.length === 0) {
      html += `<p>No transactions found for this address.</p>`;
    }

    // Render transactions
    for (const tx of signatures) {
      const time = tx.blockTime
        ? new Date(Number(tx.blockTime) * 1000).toLocaleString()
        : "unknown";
      const statusClass = tx.err ? "status failed" : "status";
      const statusText = tx.err ? "Failed" : "Success";

      html += `
        
          <strong>Signature:</strong> ${tx.signature}
          <strong>Slot:</strong> ${tx.slot}
          <strong>Time:</strong> ${time}
          <strong>Status:</strong> ${statusText}
        
      `;
    }

    resultsDiv.innerHTML = html;
  } catch (err) {
    errorDiv.textContent = `Error: ${err.message}`;
  } finally {
    loadingDiv.textContent = "";
  }
});