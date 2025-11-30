import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import JackpotABI from './Jackpot.json'
import './App.css'

const CONTRACT_ADDRESS = "0x8a048c5Ee2570Bb40f7d0960B3E50f59bC699B62" // New Sepolia address (1 min, auto-distribute)
const SEPOLIA_CHAIN_ID = "0xaa36a7"

function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [players, setPlayers] = useState([])
  const [jackpot, setJackpot] = useState("0")
  const [isEnded, setIsEnded] = useState(false)
  const [endTime, setEndTime] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const timerRef = useRef(null)

  useEffect(() => {
    connectWallet()
  }, [])

  useEffect(() => {
    if (contract) {
      fetchGameState()
      const interval = setInterval(fetchGameState, 5000)
      return () => clearInterval(interval)
    }
  }, [contract])

  // Local countdown timer
  useEffect(() => {
    if (endTime > 0 && !isEnded) {
      if (timerRef.current) clearInterval(timerRef.current)

      timerRef.current = setInterval(() => {
        const now = Math.floor(Date.now() / 1000)
        const remaining = endTime - now
        if (remaining <= 0) {
          setTimeLeft(0)
          clearInterval(timerRef.current)
          fetchGameState()
        } else {
          setTimeLeft(remaining)
        }
      }, 1000)

      return () => clearInterval(timerRef.current)
    }
  }, [endTime, isEnded])

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

        jackpotContract.on("Deposit", () => fetchGameState())
        jackpotContract.on("WinnersPaid", () => fetchGameState())
        jackpotContract.on("GameStarted", () => fetchGameState())
        jackpotContract.on("GameSettled", () => fetchGameState())

      } catch (error) {
        console.error("Error connecting wallet:", error)
      }
    }
  }

  const fetchGameState = async () => {
    if (!contract) return
    try {
      // getGameState returns: (timeLeft, players, jackpot, isEnded, currentEndTime)
      const state = await contract.getGameState()

      const tLeft = Number(state[0])
      const currentPlayers = state[1]
      const currentJackpot = ethers.formatEther(state[2])
      const gameEnded = state[3]
      const endTimestamp = Number(state[4])

      setPlayers(currentPlayers)
      setJackpot(currentJackpot)
      setIsEnded(gameEnded)
      setEndTime(endTimestamp)

      if (tLeft === 0) {
        setTimeLeft(0)
      }
    } catch (error) {
      console.error("Error fetching state:", error)
    }
  }

  const handleStartGame = async () => {
    if (!contract) return
    setIsLoading(true)
    try {
      const tx = await contract.startGame()
      await tx.wait()
      fetchGameState()
    } catch (error) {
      console.error("Error starting game:", error)
      alert("Error: " + (error.reason || error.message))
    } finally {
      setIsLoading(false)
    }
  }

  const handleTouch = async () => {
    if (!contract) return
    setIsLoading(true)
    try {
      // If time is up, this call will trigger distribution and refund the amount
      const tx = await contract.touch({ value: 50000 })
      await tx.wait()
      fetchGameState()
    } catch (error) {
      console.error("Error touching:", error)
      alert("Error: " + (error.reason || error.message))
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="app-container">
      <div className="glass-panel">
        <h1 className="title">💎 ETHER JACKPOT 💎</h1>

        {!account ? (
          <button onClick={connectWallet} className="connect-btn">
            Connect Wallet
          </button>
        ) : (
          <div className="game-content">
            <div className="timer-section">
              <div className={`timer-display ${timeLeft < 15 ? 'critical' : ''}`}>
                {formatTime(timeLeft)}
              </div>
              <p className="timer-label">TIME REMAINING</p>
              {timeLeft < 15 && timeLeft > 0 && (
                <p className="extension-notice">⚡ EXTENSION ZONE ACTIVE (+3s/tx) ⚡</p>
              )}
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <h3>TOTAL POT</h3>
                <p className="stat-value">{jackpot} ETH</p>
              </div>
              <div className="stat-card">
                <h3>PAYOUT / PLAYER</h3>
                <p className="stat-value">
                  {players.length > 0 ? (Number(jackpot) / Math.min(players.length, 5)).toFixed(6) : "0.0"} ETH
                </p>
              </div>
            </div>

            <div className="action-section">
              {!isEnded ? (
                <button
                  onClick={handleTouch}
                  className={`action-btn ${timeLeft === 0 ? 'distribute-btn' : 'touch-btn'}`}
                  disabled={isLoading}
                >
                  {isLoading ? "PROCESSING..." : (timeLeft === 0 ? "SETTLE GAME (REFUNDED)" : "DEPOSIT (50000 wei)")}
                </button>
              ) : (
                <div className="game-over">
                  <h2>GAME OVER</h2>
                  <p>Pot Distributed to Winners</p>
                  <button
                    onClick={handleStartGame}
                    className="action-btn start-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? "STARTING..." : "START NEW GAME"}
                  </button>
                </div>
              )}
            </div>

            <div className="players-section">
              <h3>🏆 LAST 5 DEPOSITORS (WINNERS) 🏆</h3>
              <div className="players-list">
                {players.length === 0 ? (
                  <p className="no-players">No deposits yet</p>
                ) : (
                  [...players].reverse().map((p, i) => (
                    <div key={i} className="player-row">
                      <span className="player-rank">#{players.length - i}</span>
                      <span className="player-addr">
                        {p.slice(0, 6)}...{p.slice(-4)}
                        {p.toLowerCase() === account.toLowerCase() && " (YOU)"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
