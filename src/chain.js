import { ethers } from "ethers";
import { utils } from 'ethers';
import IERC20 from "../interfaces/IERC20.json";
import ISlasher from "../interfaces/ISlasher.json";
import BCSlasher from "../interfaces/BCSlasher.json";

/* HOW TO SETUP
    type 'npm run build' and 'npm run serve' in a new terminal to start the webpage
    adjust variables at EDIT in this document and index.js
    CTRL + S to save changes
    click TOGGLE SLASH
*/

/* EDIT */
const privateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
const alchemyApiKey = 'https://rpc.ankr.com/arbitrum'; //HhxVvFHxxxxxxxxxxxxxxxxxxxxxx
/* EDIT */

var contractAddress = ''; //with profit safety
// var contractAddress = '0xE7c79825628Fa84cf7630A449F8628A5dc3c09Ce'; //without profit safety
var provider = new ethers.providers.JsonRpcProvider(alchemyApiKey);
var wallet = new ethers.Wallet(privateKey, provider);
var cSLASHER = new ethers.Contract(contractAddress, ISlasher, wallet);

async function approve(tokenIn, weiIn, maxFees) {
    let t = new ethers.Contract(tokenIn, IERC20, wallet);
    if (await t.allowance(wallet.address, contractAddress) < weiIn) {
        await t.approve(contractAddress, ethers.BigNumber.from('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), {maxFeePerGas: maxFees[0], maxPriorityFeePerGas: maxFees[1]});
        console.log('APPROVED');
    }
}

async function getGasFees() {
    let response = await (await fetch(new URL('https://gasstation-mainnet.matic.network/v2'))).text();
    response = response.replace('{"safeLow":', '').replace('"standard":', '').replace('"fast":', '').replaceAll('}', '').replaceAll('{"maxPriorityFee":', '').replaceAll('"maxFee":', ''); 
    let maxFees = response.split(',');
    let maxFeePerGas = utils.parseUnits(parseFloat(maxFees[4]).toFixed(9), 'gwei'); //3 will result in less gas and slower transactions
    let maxPriorityFeePerGas = utils.parseUnits(parseFloat(maxFees[5]).toFixed(9), 'gwei'); //2 will result in less gas and slower transactions
    if (maxFeePerGas < maxPriorityFeePerGas) {
        let temp = maxPriorityFeePerGas;
        maxPriorityFeePerGas = maxFeePerGas;
        maxFeePerGas = temp;
    }
    return [maxFeePerGas, maxPriorityFeePerGas]; //? priority bigger than other
}

export async function preRun(tokenIn, tokenTrade, weiIn, routerAddress1, routerAddress2) {
    let maxFees = await getGasFees();
    await approve(tokenIn, weiIn, maxFees);
    let gl = await cSLASHER.estimateGas.slash(tokenIn, tokenTrade, weiIn, routerAddress1, routerAddress2, {maxFeePerGas: maxFees[0], maxPriorityFeePerGas: maxFees[1]}); //nonce: await provider.getTransactionCount(wallet.address)
    let gasFee = gl*maxFees[0];
    console.log('gas fee: ' + gasFee / 10**18);
    if (tokenIn == await cSLASHER.getWETH(routerAddress1)) {
        return gasFee;
    } else {
        return await getWeiOut(await cSLASHER.getWETH(routerAddress1), tokenIn, weiIn, routerAddress1);
    }
}

export async function slasher(tokenIn, tokenTrade, weiIn, routerAddress1, routerAddress2) {
    let maxFees = await getGasFees();
    let r = await cSLASHER.slash(tokenIn, tokenTrade, weiIn, routerAddress1, routerAddress2, {maxFeePerGas: maxFees[0], maxPriorityFeePerGas: maxFees[1]});
    return r.hash;
}

export async function getWeiOut(tokenIn, tokenOut, weiIn, routerAddress) {
    return cSLASHER.getWeiOutMin(tokenIn, tokenOut, weiIn, routerAddress);
}

// export async function deploy() {
//     let cf = await new ethers.ContractFactory(ISlasher, BCSlasher, wallet).deploy({gasPrice: (await provider.getFeeData()).gasPrice, chainId: 137, nonce: await provider.getTransactionCount(wallet.address), gasLimit: (await provider.getBlock('latest')).gasLimit});
//     alert(cf.address);
//     console.log(cf);
// }
