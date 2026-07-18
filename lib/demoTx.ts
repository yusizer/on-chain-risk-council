/**
 * lib/demoTx.ts — build real base64 serialized Solana txs for the chamber UI.
 * Lets the Simulator agent actually run (fork-sim) instead of skipping.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function recentBlockhash(): string {
  // Valid-looking base58 blockhash placeholder — simulation may fail on
  // blockhash but still exercises the decode + Helius path.
  return "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
}

/** Clean system transfer of 0.01 SOL (routine corridor candidate). */
export function demoTransferSerialized(): string {
  const from = Keypair.generate();
  const to = Keypair.generate();
  const tx = new Transaction({
    feePayer: from.publicKey,
    recentBlockhash: recentBlockhash(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to.publicKey,
      lamports: Math.floor(0.01 * LAMPORTS_PER_SOL),
    }),
  );
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}

/** SPL Token Approve (authority delegation) — should escalate/reject. */
export function demoApproveSerialized(): string {
  const owner = Keypair.generate();
  const source = Keypair.generate();
  const delegate = Keypair.generate();
  // Approve opcode = 4, amount = u64 max
  const data = Buffer.alloc(9);
  data[0] = 4;
  data.writeBigUInt64LE(BigInt("18446744073709551615"), 1);
  const ix = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source.publicKey, isSigner: false, isWritable: true },
      { pubkey: delegate.publicKey, isSigner: false, isWritable: false },
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: recentBlockhash(),
  }).add(ix);
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}

/** SPL Token Revoke (config, reversible-style clean approve path). */
export function demoRevokeSerialized(): string {
  const owner = Keypair.generate();
  const source = Keypair.generate();
  const data = Buffer.from([5]); // revoke
  const ix = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source.publicKey, isSigner: false, isWritable: true },
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: recentBlockhash(),
  }).add(ix);
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}
