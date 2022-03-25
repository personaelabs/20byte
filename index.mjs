import fs from 'fs';

import axios from 'axios';
import { ethers } from 'ethers';

import pkg from 'csvtojson';
const { csv } = pkg;

import sleep from 'sleep-promise';

const etherscan_api_key = JSON.parse(fs.readFileSync('secrets.json'))['ETHERSCAN_API_KEY'];

const ethers_provider = ethers.getDefaultProvider('homestead', {
  etherscan: etherscan_api_key
});

async function getPubkey(address, wait=false) {
  console.log(`Searching for first tx for address ${address}`);
  let tx_res = await axios.get('https://api.etherscan.io/api' +
                          '?module=account' +
                          '&action=txlist' +
                          `&address=${address}` +
                          '&startblock=0' +
                          '&endblock=99999999' +
                          `&apikey=${etherscan_api_key}`);
  if (wait) {
    await sleep(200);
  }

  let txes = tx_res['data']['result'];
  let from_txes = txes.filter(tx => tx.from.toLowerCase() == address.toLowerCase());
  let tx_hash = from_txes[0]['hash'];
  console.log(`Finding signature for tx ${tx_hash}`);

  let tx = await ethers_provider.getTransaction(tx_hash);
  if (wait) {
    await sleep(200);
  }

  // NOTE: taken from static data for now
  let expandedSig = {
    r: tx.r,
    s: tx.s,
    v: tx.v
  }

  let txData;
  switch (tx.type) {
    case 0:
      txData = {
        gasPrice: tx.gasPrice,
        gasLimit: tx.gasLimit,
        value: tx.value,
        nonce: tx.nonce,
        data: tx.data,
        chainId: tx.chainId, // NOTE: always mainnet
        to: tx.to
      };
      break;
    case 2: // 1559
      txData = {
        gasLimit: tx.gasLimit,
        value: tx.value,
        nonce: tx.nonce,
        data: tx.data,
        chainId: tx.chainId,
        to: tx.to,
        type: 2,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      }
      break;

    default:
      // NOTE: if this is an issue, should try other txes
      console.log(`unsupported tx found for ${address}`);
      return null;
  }

  let sig = ethers.utils.joinSignature(expandedSig)
  let rsTx = await ethers.utils.resolveProperties(txData);
  let raw = ethers.utils.serializeTransaction(rsTx) // returns RLP encoded tx
  let msgHash = ethers.utils.keccak256(raw) // as specified by ECDSA
  let msgBytes = ethers.utils.arrayify(msgHash) // create binary hash

  let pubkey = ethers.utils.recoverPublicKey(msgBytes, sig)

  console.log(`retrieved pubkey: ${pubkey}`);

  let recoveredAddress = ethers.utils.computeAddress(pubkey);
  if (recoveredAddress.toLowerCase() != address.toLowerCase()) {
    throw 'recovered address differs from original!'
  }

  return pubkey
}

async function continueBuildingAddressPubkeyCSV() {
  const allAddresses = new Set(
    Object.values(
      JSON.parse(fs.readFileSync('data/devconAddresses.json'))
    ).flat()
  );

  let rows = await csv().fromFile('output/addressPubkeys.csv');
  const finishedAddresses = new Set(
    rows.map(r => r['address'])
  )

  const addressesToProcess = [...new Set(
    [...allAddresses].filter(a => !finishedAddresses.has(a))
  )];

  for (let a of allAddresses) {
    try {
      const pubkey = await getPubkey(a, true);
      fs.appendFileSync('output/addressPubkeys.csv', `${a},${pubkey}\n`);
    }

    catch (e) {
      console.log(`failed on address ${a}: ${e}`);
      continue;
    }
  }
}

await continueBuildingAddressPubkeyCSV();
