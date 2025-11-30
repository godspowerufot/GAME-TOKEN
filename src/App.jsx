import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import JackpotABI from './Jackpot.json'
import './App.css'

const CONTRACT_ADDRESS = "0x9edeffd1317E0Cf06238B0e5124d6FfD597D521F" // Sepolia address
const SEPOLIA_CHAIN_ID = "0xaa36a7"


function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [players, setPlayers] = useState([])
  const [jackpot, setJackpot] = useState("0")
  const [isEnded, setIsEnded] = useState(false)
  const [criticalTouches, setCriticalTouches] = useState(0)
  const [winner, setWinner] = useState(null)

  const endTimeRef = useRef(null)
  const startTimeRef = useRef(null)
  const localTimerRef = useRef(null)

  useEffect(() => {
    connectWallet()
  }, [])

  // Sync with contract every 5 seconds
  useEffect(() => {
    if (contract) {
      fetchGameState() // Initial fetch
      const interval = setInterval(fetchGameState, 5000)
      return () => clearInterval(interval)
    }
  }, [contract])

  // Local timer that updates every second
  useEffect(() => {
    if (endTimeRef.current && startTimeRef.current) {
      if (localTimerRef.current) {
        clearInterval(localTimerRef.current)
      }

      localTimerRef.current = setInterval(() => {
        const now = Math.floor(Date.now() / 1000)
        const remaining = endTimeRef.current - now
        const elapsed = now - startTimeRef.current

        if (remaining <= 0) {
          setTimeLeft(0)
          setElapsedTime(600) // 10 minutes
          clearInterval(localTimerRef.current)
        } else {
          setTimeLeft(remaining)
          setElapsedTime(elapsed >= 0 ? elapsed : 0)
        }
      }, 1000)

      return () => {
        if (localTimerRef.current) {
          clearInterval(localTimerRef.current)
        }
      }
    }
  }, [endTimeRef.current, startTimeRef.current])

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' })
        if (chainId !== SEPOLIA_CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: SEPOLIA_CHAIN_ID }],
            })
          } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
              alert("Please add Sepolia network to your MetaMask")
            } else {
              alert("Please switch to Sepolia network")
            }
            return
          }
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        setAccount(accounts[0])
        const provider = new ethers.BrowserProvider(window.ethereum)
        const signer = await provider.getSigner()
        const jackpotContract = new ethers.Contract(CONTRACT_ADDRESS, JackpotABI.abi, signer)
        setContract(jackpotContract)

        // Listen for events
        jackpotContract.on("Touched", (player, newEndTime, touches) => {
          fetchGameState()
        })
        jackpotContract.on("WinnerPicked", (winnerAddr, amount) => {
          setWinner(winnerAddr)
          setIsEnded(true)
        })

      } catch (error) {
        console.error("Error connecting wallet:", error)
      }
    }
  }

  const fetchGameState = async () => {
    if (!contract) return
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const currentBlock = await provider.getBlock('latest')
      const currentTimestamp = currentBlock.timestamp

      const state = await contract.getGameState()
      const contractEndTime = await contract.gameEndTime()

      // Calculate actual end time
      const endTime = Number(contractEndTime)
      endTimeRef.current = endTime

      // Calculate start time (end time - 10 minutes)
      const startTime = endTime - 600
      startTimeRef.current = startTime

      // Calculate time left and elapsed
      const remaining = endTime - currentTimestamp
      const elapsed = currentTimestamp - startTime
      setTimeLeft(remaining > 0 ? remaining : 0)
      setElapsedTime(elapsed >= 0 ? elapsed : 0)

      setPlayers(state[1])
      setJackpot(ethers.formatEther(state[2]))
      setIsEnded(state[3])

      const cTouches = await contract.criticalTouches()
      setCriticalTouches(Number(cTouches))

      if (state[3]) {
        const w = await contract.winner()
        if (w !== ethers.ZeroAddress) setWinner(w)
      }
    } catch (error) {
      console.error("Error fetching state:", error)
    }
  }

  const handleTouch = async () => {
    if (!contract) return
    try {
      const tx = await contract.touch({ value: 50000 })
      await tx.wait()
      fetchGameState()
    } catch (error) {
      console.error("Error touching:", error)
      alert("Error: " + (error.reason || error.message))
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="container">
      <h1>🍑 Jackpot 🍑</h1>

      {!account ? (
        <button onClick={connectWallet} className="connect-btn">Connect Wallet</button>
      ) : (
        <div className="game-interface">
          <div className="timer-box">
            <h2>Elapsed Time</h2>
            <div className={`timer ${elapsedTime >= 540 ? 'critical' : ''}`}>
              {formatTime(elapsedTime)}
            </div>
            {elapsedTime >= 540 && <p className="decay-info">Critical Zone! (+3s per touch)</p>}
          </div>

          <div className="jackpot-info">
            <h3>Jackpot: {jackpot} ETH</h3>
            <p>Critical Touches: {criticalTouches}</p>
          </div>

          {!isEnded ? (
            <button onClick={handleTouch} className="touch-btn">
              TOUCH (50000 wei)
            </button>
          ) : (
            <div className="winner-box">
              <h2>GAME OVER</h2>
              <p>Winner: {winner}</p>
            </div>
          )}

          <div className="players-list">
            <h3>Last 5 Players</h3>
            <ul>
              {players.map((p, i) => (
                <li key={i}>{p.slice(0, 6)}...{p.slice(-4)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
