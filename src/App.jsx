import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import JackpotABI from './Jackpot.json'
import './App.css'

const CONTRACT_ADDRESS = "0x977022C8aA02C8a9030629cE60f4F03Dac60092f" // New Sepolia address
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
          // Optionally fetch state to confirm end
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

      // If contract says time is up (tLeft == 0), trust it
      if (tLeft === 0) {
        setTimeLeft(0)
      }
    } catch (error) {
      console.error("Error fetching state:", error)
    }
  }

  const handleTouch = async () => {
    if (!contract) return
    setIsLoading(true)
    try {
      const tx = await contract.touch({ value: 50000 }) // 50000 wei
      await tx.wait()
      fetchGameState()
    } catch (error) {
      console.error("Error touching:", error)
      alert("Error: " + (error.reason || error.message))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDistribute = async () => {
    if (!contract) return
    setIsLoading(true)
    try {
      const tx = await contract.pickWinner()
      await tx.wait()
      fetchGameState()
    } catch (error) {
      console.error("Error distributing:", error)
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
              <div className={`timer-display ${timeLeft < 60 ? 'critical' : ''}`}>
                {formatTime(timeLeft)}
              </div>
              <p className="timer-label">TIME REMAINING</p>
              {timeLeft < 60 && timeLeft > 0 && (
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
                timeLeft > 0 ? (
                  <button
                    onClick={handleTouch}
                    className="action-btn touch-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? "PROCESSING..." : "DEPOSIT (50000 wei)"}
                  </button>
                ) : (
                  <button
                    onClick={handleDistribute}
                    className="action-btn distribute-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? "DISTRIBUTING..." : "DISTRIBUTE POT"}
                  </button>
                )
              ) : (
                <div className="game-over">
                  <h2>GAME OVER</h2>
                  <p>Pot Distributed to Winners</p>
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
