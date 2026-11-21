#!/usr/bin/env bash
set -euo pipefail

# AegisVault Local Anvil Mainnet/Base Fork Bootstrap
# Starts a deterministic local EVM fork on http://127.0.0.1:8545 (chainId 31337),
# funds the target Safe + Anvil test signer, and impersonates a Safe owner so
# Multicall reads, slot-4 simulations, and batch proposals work without real funds.

FORK_URL="${FORK_URL:-${RPC_URL_MAINNET:-https://ethereum-rpc.publicnode.com}}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
SAFE_ADDRESS="${SEED_SAFE_ADDRESS:-0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f}"
TEST_SIGNER="${TEST_SIGNER:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
ANVIL_RPC="http://127.0.0.1:${ANVIL_PORT}"

if ! command -v anvil >/dev/null 2>&1; then
  echo "Error: Foundry 'anvil' is not installed. Install via: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

echo "==> Starting Anvil fork from ${FORK_URL} on ${ANVIL_RPC} (chainId=${ANVIL_CHAIN_ID})"
anvil \
  --fork-url "${FORK_URL}" \
  --port "${ANVIL_PORT}" \
  --chain-id "${ANVIL_CHAIN_ID}" \
  --accounts 10 \
  --balance 10000 \
  --auto-impersonate &

ANVIL_PID=$!
trap 'echo "==> Stopping Anvil (pid=${ANVIL_PID})"; kill "${ANVIL_PID}" 2>/dev/null || true' EXIT INT TERM

echo "==> Waiting for Anvil JSON-RPC to become ready..."
for i in $(seq 1 30); do
  if curl -s -X POST "${ANVIL_RPC}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if command -v cast >/dev/null 2>&1; then
  echo "==> Funding Safe ${SAFE_ADDRESS} and Test Signer ${TEST_SIGNER} with 100 ETH..."
  cast rpc anvil_setBalance "${SAFE_ADDRESS}" "0x56BC75E2D63100000" --rpc-url "${ANVIL_RPC}" >/dev/null
  cast rpc anvil_setBalance "${TEST_SIGNER}" "0x56BC75E2D63100000" --rpc-url "${ANVIL_RPC}" >/dev/null

  echo "==> Inspecting current Safe owners..."
  OWNERS_RAW=$(cast call "${SAFE_ADDRESS}" "getOwners()(address[])" --rpc-url "${ANVIL_RPC}" 2>/dev/null || true)
  if [[ -n "${OWNERS_RAW}" ]]; then
    FIRST_OWNER=$(echo "${OWNERS_RAW}" | grep -oE '0x[a-fA-F0-9]{40}' | head -n 1 || true)
    if [[ -n "${FIRST_OWNER}" ]]; then
      echo "==> Impersonating existing Safe owner ${FIRST_OWNER} and funding gas..."
      cast rpc anvil_impersonateAccount "${FIRST_OWNER}" --rpc-url "${ANVIL_RPC}" >/dev/null
      cast rpc anvil_setBalance "${FIRST_OWNER}" "0x56BC75E2D63100000" --rpc-url "${ANVIL_RPC}" >/dev/null
    fi
  fi
else
  echo "==> 'cast' not found; skipping Safe funding/impersonation helpers."
fi

echo "==> AegisVault Anvil fork is live at ${ANVIL_RPC} (chainId=${ANVIL_CHAIN_ID})"
echo "==> Safe Address: ${SAFE_ADDRESS}"
echo "==> Test Signer : ${TEST_SIGNER}"
wait "${ANVIL_PID}"
