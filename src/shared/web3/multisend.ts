import {
  concatHex,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  padHex,
  size,
  sliceHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { multiSendCallOnlyAbi } from "@/shared/web3/abis";

export interface MetaTransactionData {
  to: Address;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
}

/**
 * Encodes a single call into the Gnosis Safe MultiSend packed byte format:
 *   operation (1 byte, strictly 0 = CALL for MultiSendCallOnly)
 *   to        (20 bytes)
 *   value     (32 bytes)
 *   dataLen   (32 bytes)
 *   data      (dataLen bytes)
 */
function encodeSinglePackedCall(tx: Omit<MetaTransactionData, "operation">): Hex {
  const opByte: Hex = "0x00"; // Enforce CALL only (onlyCalls: true)
  const toBytes = getAddress(tx.to) as Hex;
  const valueBytes = padHex(toHex(tx.value), { size: 32 });
  const dataByteLen = size(tx.data);
  const dataLenBytes = padHex(toHex(BigInt(dataByteLen)), { size: 32 });

  return concatHex([opByte, toBytes, valueBytes, dataLenBytes, tx.data]);
}

/**
 * Packs an array of CALL transactions for Safe MultiSendCallOnly v1.4.1.
 */
export function encodeMultiSendPackedBytes(
  txs: ReadonlyArray<Omit<MetaTransactionData, "operation">>
): Hex {
  if (txs.length === 0) {
    return "0x";
  }
  return concatHex(txs.map(encodeSinglePackedCall));
}

/**
 * Encodes the full `multiSend(bytes)` calldata targeting canonical MultiSendCallOnly.
 */
export function encodeMultiSendCallData(
  txs: ReadonlyArray<Omit<MetaTransactionData, "operation">>
): Hex {
  const packed = encodeMultiSendPackedBytes(txs);
  return encodeFunctionData({
    abi: multiSendCallOnlyAbi,
    functionName: "multiSend",
    args: [packed],
  });
}

/**
 * Decodes packed MultiSend / MultiSendCallOnly transaction bytes back into
 * individual MetaTransactionData items for inspection and risk analysis.
 */
export function decodeMultiSendPackedBytes(packed: Hex): MetaTransactionData[] {
  const totalBytes = size(packed);
  const results: MetaTransactionData[] = [];
  let offset = 0;

  while (offset + 85 <= totalBytes) {
    const opRaw = Number(hexToBigInt(sliceHex(packed, offset, offset + 1)));
    const operation: 0 | 1 = opRaw === 1 ? 1 : 0;
    offset += 1;

    const toRaw = sliceHex(packed, offset, offset + 20);
    const to = getAddress(toRaw);
    offset += 20;

    const value = hexToBigInt(sliceHex(packed, offset, offset + 32));
    offset += 32;

    const dataLenBig = hexToBigInt(sliceHex(packed, offset, offset + 32));
    const dataLen = Number(dataLenBig);
    offset += 32;

    if (dataLen < 0 || offset + dataLen > totalBytes) {
      break;
    }

    const data: Hex =
      dataLen === 0 ? "0x" : sliceHex(packed, offset, offset + dataLen);
    offset += dataLen;

    results.push({
      operation,
      to,
      value,
      data,
    });
  }

  return results;
}
