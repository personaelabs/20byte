import fs from 'fs';

import axios from 'axios';
import { ethers } from 'ethers';

const etherscan_api_key = JSON.parse(fs.readFileSync('secrets.json'))['ETHERSCAN_API_KEY'];

const ethers_provider = ethers.getDefaultProvider('homestead', {
  etherscan: etherscan_api_key
});

async function getPubkey(address) {
  console.log(`Searching for first tx for address ${address}`);
  let tx_res = await axios.get('https://api.etherscan.io/api' +
                          '?module=account' +
                          '&action=txlist' +
                          `&address=${address}` +
                          '&startblock=0' +
                          '&endblock=99999999' +
                          `&apikey=${etherscan_api_key}`);

  let txes = tx_res['data']['result'];
  let from_txes = txes.filter(tx => tx.from.toLowerCase() == address.toLowerCase());
  let tx_hash = from_txes[0]['hash'];
  console.log(`Finding signature for tx ${tx_hash}`);

  let tx = await ethers_provider.getTransaction(tx_hash);
  console.log(tx);

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
        chainId: 1, // NOTE: always mainnet
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
  // NOTE: for sanity checking
  let recoveredAddress = ethers.utils.computeAddress(pubkey);
  console.log(`recovered address: ${recoveredAddress}`);

  return pubkey
}

// TODO: code for pulling all pubkeys, create addr->pubkey mapping
// just all addresses for now
//const addresses = [...new Set(
  //Object.values(
    //JSON.parse(fs.readFileSync('data/devconAddresses.json'))
  //).flat()
//)];

//// 5 api calls/sec, 2 calls per address
//let i = 0;
//for (let a of addresses) {
  //const pubkey = await getPubkey(a);
  //// stream pubkeys out

  //i++;
//}
