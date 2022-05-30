import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { Contract, providers, utils } from "ethers"
import Head from "next/head"
import React from "react"
import { useState} from "react"
import { useForm, Controller, SubmitHandler } from "react-hook-form"
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"
import {
  TextField,
  Button,
  ThemeProvider
} from "@material-ui/core";
import Box from '@mui/material/Box';
import { createTheme } from '@material-ui/core/styles'
import styles from "../styles/Home.module.css"
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from "yup";

const theme = createTheme({
  palette: {
    type: "dark"
  }
});

type FormValues = {
  Name: string;
  Age: number;
  Address: string;
};

const defaultValues = {
  Name: "",
  Age: 18,
  Address: ""
};

const schema = yup.object({
  Name: yup.string().required(),
  Age: yup.number().positive().integer(),
  Address: yup.string()
});

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const { handleSubmit,
    register,
    reset,
    control,
    formState: { errors } } = useForm<FormValues>({defaultValues});
    const onSubmit: SubmitHandler<FormValues> = (data) => greet(JSON.stringify(data));
    const [data, setData] = useState("");
    const [greeting, setGreeting] = useState("")

    listenToGreets();


    async function listenToGreets() {

        // console.log("This is the start of greet listener")
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
                                      Greeter.abi,
                                      provider)

        contract.on("NewGreeting", (greeting: string) => {
            setGreeting("New Greeting Detected: " + utils.parseBytes32String(greeting));
        })


    }


    async function greet(data) {

        setLogs("Creating your Semaphore identity...")
        console.log(data)
        schema.validate(data);
        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    return (
        <ThemeProvider theme={theme}>
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>
                <form onSubmit={handleSubmit(onSubmit)} className="form">
                  <section>
                     <Controller
                       render={({ field }) => <TextField {...field} label="Name"/>}
                       name="Name"
                       control={control}
                     />
                 </section>
                 <section>
                  <Controller
                    render={({ field }) => <TextField {...field} label="Age" type="number"/>}
                    name="Age"
                    control={control}
                  />
                </section>
                <section>
                 <Controller
                   render={({ field }) => <TextField {...field} label="Address" multiline minRows={4}/>}
                   name="Address"
                   control={control}
                 />
               </section>
               <Box sx={{p: 1, m: 5}}>
                    <Button variant="contained" type="submit">Submit</Button>
              </Box>
                 </form>
                 <Box
                     sx={{
                       width: 300,
                       height: 60,
                       backgroundColor: 'primary.dark',
                       '&:hover': {
                         backgroundColor: 'primary.main',
                         opacity: [0.9, 0.8, 0.7],
                       },
                     }}
                >
                 <p align="center">{greeting}</p>
                </Box>
            </main>
        </div>
        </ThemeProvider>
    )
}
