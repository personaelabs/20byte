import fs from 'fs';

import axios from 'axios';
import { ethers } from 'ethers';

const etherscan_api_key = JSON.parse(fs.readFileSync('secrets.json'))['ETHERSCAN_API_KEY'];

const ethers_provider = ethers.getDefaultProvider('homestead', {
  etherscan: etherscan_api_key
});

// NOTE: random tx
const address = '0x977441c8e415c98b5d82255371820111eb9fbe18'

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

// TODO: need to switch things up for EIP1559: https://gist.github.com/chrsengel/2b29809b8f7281b8f10bbe041c1b5e00?permalink_comment_id=4043715#gistcomment-4043715

// NOTE: this stuff works:
// NOTE: taken from static data for now
let expandedSig = {
  r: '0xcd17bb77a6bdc426081b52c26bb391c38958e58fa7db95e65bb721ef0f4ef2a3',
  s: '0x6a2c5866ec0209ef7bf94efd7a45887d4c374c31d185385c209fc8426adab312',
  v: 38
}
let txData = {
  gasPrice: ethers.BigNumber.from('0x098bca5a00'),
  gasLimit: ethers.BigNumber.from('0x5208'),
  value: ethers.BigNumber.from('0x05543df729c000'),
  nonce: 0,
  data: '0x',
  chainId: 1,
  to: '0xed625c9ABa1245Fa8e22eb1f1825881517A9DCE7'
}

let sig = ethers.utils.joinSignature(expandedSig)
let rsTx = await ethers.utils.resolveProperties(txData);
let raw = ethers.utils.serializeTransaction(rsTx) // returns RLP encoded tx
let msgHash = ethers.utils.keccak256(raw) // as specified by ECDSA
let msgBytes = ethers.utils.arrayify(msgHash) // create binary hash

let pubkey = ethers.utils.recoverPublicKey(msgBytes, sig)

console.log(`Pubkey: ${pubkey}`);

let recoveredAddress = ethers.utils.computeAddress(pubkey);
console.log(`Address: ${recoveredAddress}`);
