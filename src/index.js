import { utils } from 'ethers';
import { slasher, getWeiOut, preRun, deploy} from './chain.js';

/* ERRORS
    if there's an error in the transaction that used gas, the bot will pause to protect from future gas drains.
    to inspect errors, right click on the page, click inspect, and click the console tab.
    
    POSSIBLE ERRORS
        bad token/router:
            the liquidity pair doesn't exist on one of the routers
            check alchemy that the api key is still live
        unlucky prediction of next gas price (spikes in gas fees might trigger this error for 1 block):
            gas too low: will revert the transaction (rare because of tolerance cushion)
            gas too high: possible to miss a small arbitrage
        slower arbitrage: 
            gwei set to fast (more gas than standard) but someone who pays more gas can take the opportunity (consumes your gas).
*/

// /* EDIT */
let _tokensIn = ['0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270']; //wmatic prefered since most liquidity pools connect to wmatic
let _amtBorrowed = ['100', '10']; //must be paired with tokensIn. (ex: borrow 100 wmatic, borrow 10 wmatic)
let _tokensTraded = ['0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' , '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a', '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', '0x0B220b82F3eA3B7F6d9A1D8ab58930C064A2b5Bf', '0x101a023270368c0d50bffb62780f4afd4ea79c35', '0xe0339c80ffde91f3e20494df88d4206d86024cdf', '0x1B815d120B3eF02039Ee11dC2d33DE7aA4a8C603', '0x61299774020dA444Af134c82fa83E3810b309991', '0x8765f05ADce126d70bcdF1b0a48Db573316662eB', '0x8a2870fb69A90000D6439b7aDfB01d4bA383A415', '0xAcD7B3D9c10e97d0efA418903C0c7669E702E4C0', '0xb0897686c545045aFc77CF20eC7A532E3120E0F1'];
let _routers = ['0x1b02da8cb0d097eb8d57a175b88c7d8b47997506', '0x3a1D87f206D12415f5b0A33E786967680AAb4f6d', '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', '0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607']; //ex: quickswap router
// /* EDIT */

/*  HELP:
    CTRL + S: saves and resets document. Must be done to confirm edits.
    tokensIn and tokensTraded should have a liquidity pair on all routers (DAI/WMATIC pairs well but AAVE/LINK might not)
*/

/* OUTPUT LOG NOTATION
    0: token borrowed
    1: token traded
    2: wei borrowed
    3: wei out
    4: router 1
    5: router 2
*/

var arbitrage = {
    'tokensIn': _tokensIn,
    'tokensTraded': _tokensTraded,
    'amtBorrowed': _amtBorrowed,
    'routers': _routers
}
var paused = true;
var loopCounter = 0;
var arbitrageCounter = 0;
var txHashes = '';

async function checkArb(tokenIn, tokenTraded, weiBorrowed, router1, router2) {
    let w1 = getWeiOut(tokenIn, tokenTraded, weiBorrowed, router1);
    let w2 = getWeiOut(tokenTraded, tokenIn, w1, router2);
    return [tokenIn, tokenTraded, weiBorrowed, w2, router1, router2]; 
}

async function findArb(arbitrage) {
    let data = [];
    let maxProfit = -2^15;
    for (let h=0; h < arbitrage.tokensIn.length; h++) {
        for(let i=0; i < arbitrage.tokensTraded.length; i++) {
            for(let j=0; j < arbitrage.routers.length; j++) {
                for(let k=0; k < arbitrage.routers.length; k++) {
                    if (j!=k && arbitrage.tokensIn[h] != arbitrage.tokensTraded[i]) {
                        data.push(checkArb(arbitrage.tokensIn[h], arbitrage.tokensTraded[i], utils.parseEther(arbitrage.amtBorrowed[h]), arbitrage.routers[j], arbitrage.routers[k]));
                    }
                }
            }
        }
    }

    for (let i=0; i < data.length; i++) {
        let di;
        let wOut;
        try {
            di = await data[i];
            wOut = await di[3];
            di[3] = wOut;
        } catch {
            console.log('ERROR BELOW: tokens do not have liquidity pair on at least one of these routers');
        }

        let profit = (wOut - di[2]) / di[2] * 100;
        if (profit > maxProfit) {
            maxProfit = profit;
            if(maxProfit < 0) {
                document.getElementById('maxProfit').style.color = 'red';
            } else {
                document.getElementById('maxProfit').style.color = 'green';
            }
            document.getElementById('maxProfit').innerHTML = 'maximum profit this loop: ' + maxProfit.toFixed(6) + ' %';
        }

        console.log(di);
        console.log('profit: ' + profit + '%');
        
        if(profit > 0) {
            if (wOut - di[2] > await preRun(di[0], di[1], di[2], di[4], di[5])) {
                try {
                    let txHash;
                    arbitrageCounter++;
                    document.getElementById('arbitrageCounter').innerHTML = 'arbitrages found: ' + arbitrageCounter;
                    txHash = await slasher(di[0], di[1], di[2], di[4], di[5]);
                    txHashes += '<br>' + txHash;
                    document.getElementById('txHash').innerHTML = txHashes;
                    console.log('SUCCESSFUL ARBITRAGE ABOVE');
                } catch (er) {
                    console.log(er);
                    console.log('ERROR ABOVE: arbitrage failed');
                    paused = true;
                    alert('bot paused, arbitrage failed');
                    break;
                }
            }
        }
    }
}

async function looper() {
    loopCounter = 0;
    arbitrageCounter = 0;
    while (!paused) {
        await findArb(arbitrage);
        loopCounter++;
        document.getElementById('loopCounter').innerHTML = 'loop iterations: ' + loopCounter;
    }
}

async function toggleSlash() {
    if (paused) {
        paused = false;
        looper();
    }
    else {
        paused = true;
        alert('bot will pause after loop (refresh page to force stop)');
    }
}

//EVENTS
document.getElementById('toggleSlash').addEventListener("click", e => {toggleSlash()});
// document.getElementById('deploy').addEventListener("click", async() => {await deploy()});
