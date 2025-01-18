import { Token, SUPPORTED_CHAINS, ChainId } from "@uniswap/sdk-core";
import { Pool } from "@uniswap/v3-sdk";
import Decimal from "decimal.js";
import { JsonRpcProvider, Contract } from "ethers";
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Web3 from "web3";

export type CryptoBalances = {
    address: string;
    balances: TokenBalance[];
    last_updated: number;
}

type TokenInfo = {
    symbol: string;
    address: string;
    decimals: number;
};


export type TokenBalance = {
    symbol: string;
    balance: number;
    value: number;
};

const ETH_TOKEN_INFO = {
    symbol: "ETH",
    address: "",
    decimals: 30,
};

const WETH_TOKEN_INFO = {
    symbol: "WETH",
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    decimals: 18,
}

const WETH_TOKEN = new Token(
    SUPPORTED_CHAINS[ChainId.MAINNET],
    WETH_TOKEN_INFO.address,
    WETH_TOKEN_INFO.decimals,
)

const TOKENS_MAP: TokenInfo[] = [
    ETH_TOKEN_INFO,
    WETH_TOKEN_INFO,
    // {
    //     symbol: "USDC",
    // },
    {
        symbol: "LINK",
        address: "0x514910771af9ca656af840dff83e8264ecf986ca",
        decimals: 18,
    },
    {
        symbol: "UNI",
        address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        decimals: 18
    },
    {
        symbol: "AAVE",
        address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        decimals: 18
    },
    {
        symbol: "COMP",
        address: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
        decimals: 18
    },
];
const USDT_ETH_POOL = "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36";

const provider = new JsonRpcProvider(process.env.INFURA_URL || "");
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_URL || ""));

export async function getTokens(address: string): Promise<TokenBalance[]> {
    console.log("Getting tokens for address: %s", address)
    const ethPrice = await getTokenValueFromPool(ETH_TOKEN_INFO, USDT_ETH_POOL);
    return (await Promise.all(TOKENS_MAP.map(async (token: TokenInfo) => {
        const balance =
            token == ETH_TOKEN_INFO
                ? await provider.getBalance(address)
                : await web3.eth.call({
                    to: token.address,
                    data: web3.eth.abi.encodeFunctionCall({
                        name: 'balanceOf',
                        type: 'function',
                        inputs: [{
                            type: 'address',
                            name: 'owner'
                        }]
                    }, [address])
                });

        const readableBal = parseFloat(web3.utils.fromWei(balance, 'ether'))
        if (readableBal == 0) {
            // console.log(`No balance for ${token.symbol}`)
            return
        }
        const priceInEth = token == ETH_TOKEN_INFO || token == WETH_TOKEN_INFO
            ? 1
            : await getTokenUSDValue(token);
        return {
            symbol: token.symbol,
            balance: readableBal,
            value: parseFloat((readableBal * priceInEth * ethPrice).toFixed(2)),
        } as TokenBalance;
    }))).filter((token): token is TokenBalance => token != undefined && token.balance > 0);
}

async function getTokenValueFromPool(tokenInfo: TokenInfo, poolAddress: string): Promise<number> {
    const poolContract = new Contract(poolAddress, IUniswapV3PoolABI.abi, provider)
    const slot0 = await poolContract.slot0()
    const sqrtPriceX96: bigint = slot0[0]

    const priceInUSD = _sqrtPriceX96ToPrice(sqrtPriceX96, tokenInfo.decimals);
    return priceInUSD;
}

async function getTokenUSDValue(tokenInfo: TokenInfo): Promise<number> {
    const poolAddress =
        Pool.getAddress(new Token(
            SUPPORTED_CHAINS[ChainId.MAINNET],
            tokenInfo.address,
            tokenInfo.decimals,
        ), WETH_TOKEN, 3000)

    if (poolAddress === '0x0000000000000000000000000000000000000000') {
        console.log(`No Uniswap V3 pool found for ${tokenInfo.address} and WETH`);
        return 0;
    }

    return await getTokenValueFromPool(tokenInfo, poolAddress);
}

function _sqrtPriceX96ToPrice(sqrtPriceX96: bigint, tokenDecimals: number): number {
    return Decimal.pow(sqrtPriceX96.toString(), 2).div(Decimal.pow(2, 192)).mul(Decimal.pow(10, tokenDecimals - 18)).toNumber();
}