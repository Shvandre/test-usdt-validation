import {Address, beginCell, internal, SendMode, toNano} from "@ton/core"
import {TonClient, WalletContractV5R1, TupleItemSlice} from "@ton/ton"
import {mnemonicToPrivateKey} from "@ton/crypto"

import "dotenv/config"

async function main() {
    const mnemonics = process.env.MNEMONICS
    if (mnemonics === undefined) {
        console.error("Mnemonics is not provided, please add it to .env file")
        throw new Error("Mnemonics is not provided")
    }

    // We will use Jetton master contract to find users's Jetton wallet
    const jettonMasterAddress = Address.parse("put the Jetton master address")
    const senderRegularWalletAddress = Address.parse("put your regular wallet address")
    const destinationAddress = Address.parse("put destination wallet address")
    // The wallet address used to return remaining Toncoin through the excesses message.
    const responseDestinationAddress = Address.parse("put response destination address")

    // connect to your regular walletV5
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
    })
    const provider = client.provider(senderRegularWalletAddress)

    const your_mnemonic = "put your mnemonic here, ..."
    const keyPair = await mnemonicToPrivateKey(your_mnemonic.split(" "))
    const walletContract = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    })

    // Find your Jetton wallet Address
    const walletAddressCell = beginCell().storeAddress(senderRegularWalletAddress).endCell()
    const el: TupleItemSlice = {
        type: "slice",
        cell: walletAddressCell,
    }
    const data = await client.runMethod(jettonMasterAddress, "get_wallet_address", [el])
    const jettonWalletAddress = data.stack.readAddress()

    // form the transfer message
    const forwardPayload = beginCell()
        .storeUint(0, 32) // 0 opcode means we have a comment
        .storeStringTail("for coffee")
        .endCell()

    const messageBody = beginCell()
        .storeUint(0x0f8a7ea5, 32) // opcode for jetton transfer
        .storeUint(0, 64) // query id
        .storeCoins(toNano(5)) // jetton amount, amount * 10^9
        .storeAddress(destinationAddress) // the address of the new jetton owner
        .storeAddress(responseDestinationAddress) // response destination
        .storeBit(0) // no custom payload
        .storeCoins(toNano("0.02")) // forward amount - if >0, will send notification message
        .storeBit(1) // store forwardPayload as a reference
        .storeRef(forwardPayload)
        .endCell()

    const transferMessage = internal({
        to: jettonWalletAddress,
        value: toNano("0.1"),
        bounce: true,
        body: messageBody,
    })

    // send the transfer message through your wallet
    const seqno = await walletContract.getSeqno(provider)
    await walletContract.sendTransfer(provider, {
        seqno: seqno,
        secretKey: keyPair.secretKey,
        messages: [transferMessage],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
    })
}

void main()
