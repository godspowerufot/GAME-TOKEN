import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import JackpotABI from './Jackpot.json'
import './App.css'

const CONTRACT_ADDRESS = "0x98D9f8b835Af4b1925CC20dE4c6C6B53B512dCdA" // Direct-send contract (10 min timer)
const SEPOLIA_RPC = "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161" // Public Infura RPC

function App() {
  const [contract, setContract] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [players, setPlayers] = useState([])
  const [jackpot, setJackpot] = useState("0")
  const [endTime, setEndTime] = useState(0)
  const [allTransactions, setAllTransactions] = useState([])
  const [currentRound, setCurrentRound] = useState(1)
  const [copied, setCopied] = useState(false)

  const timerRef = useRef(null)

  useEffect(() => {
    initContract()
  }, [])

  useEffect(() => {
    if (contract) {
      fetchGameState()
      const interval = setInterval(fetchGameState, 5000)
      return () => clearInterval(interval)
    }
  }, [contract])

  // Local countdown timer - continuously running
  useEffect(() => {
    if (endTime > 0) {
      if (timerRef.current) clearInterval(timerRef.current)

      timerRef.current = setInterval(() => {
        const now = Math.floor(Date.now() / 1000)
        const remaining = endTime - now
        if (remaining <= 0) {
          setTimeLeft(0)
          fetchGameState()
        } else {
          setTimeLeft(remaining)
        }
      }, 1000)

      return () => clearInterval(timerRef.current)
    }
  }, [endTime])

  const initContract = async () => {
    try {
      // Use public RPC provider (read-only, no wallet needed)
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
      const jackpotContract = new ethers.Contract(CONTRACT_ADDRESS, JackpotABI.abi, provider)
      setContract(jackpotContract)

      // Listen to events
      jackpotContract.on("Deposit", () => fetchGameState())
      jackpotContract.on("WinnersPaid", () => fetchGameState())
      jackpotContract.on("RoundStarted", () => fetchGameState())
      jackpotContract.on("RoundEnded", () => fetchGameState())
    } catch (error) {
      console.error("Error initializing contract:", error)
    }
  }

  const fetchGameState = async () => {
    if (!contract) return
    try {
      const state = await contract.getGameState()

      const tLeft = Number(state[0])
      const currentPlayers = state[1]
      const currentJackpot = ethers.formatEther(state[2])
      const endTimestamp = Number(state[3])
      const round = Number(state[4])

      setPlayers(currentPlayers)
      setJackpot(currentJackpot)
      setEndTime(endTimestamp)
      setCurrentRound(round)

      if (tLeft === 0) {
        setTimeLeft(0)
      }

      // Fetch all transactions
      const txs = await contract.getAllTransactions()
      const formattedTxs = txs.map(tx => ({
        player: tx.player,
        amount: ethers.formatEther(tx.amount),
        timestamp: Number(tx.timestamp),
        round: Number(tx.round)
      }))
      setAllTransactions(formattedTxs)
    } catch (error) {
      console.error("Error fetching state:", error)
    }
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

        <div className="game-content">
          {/* Contract Address Display */}
          <div className="contract-address-section">
            <h3 className="send-instruction">📤 SEND ETH TO THIS ADDRESS TO PARTICIPATE</h3>
            <div className="address-box" onClick={copyAddress}>
              <span className="address-text">{CONTRACT_ADDRESS}</span>
              <button className="copy-btn">{copied ? '✓ Copied!' : '📋 Copy'}</button>
            </div>
            <p className="address-note">Click to copy • Send any amount of ETH to participate</p>
          </div>

          <div className="round-indicator">
            <span className="round-label">ROUND</span>
            <span className="round-number">#{currentRound}</span>
          </div>

          <div className="timer-section">
            <div className={`timer-display ${timeLeft < 60 ? 'critical' : ''}`}>
              {formatTime(timeLeft)}
            </div>
            <p className="timer-label">TIME REMAINING</p>
            {timeLeft < 60 && timeLeft > 0 && (
              <p className="extension-notice">⚡ EXTENSION ZONE ACTIVE (+3s/tx) ⚡</p>
            )}
            {timeLeft === 0 && (
              <p className="waiting-notice">⏳ WAITING FOR PAYOUT...</p>
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <h3>TOTAL POT</h3>
              <p className="stat-value">{jackpot} ETH</p>
            </div>
            <div className="stat-card">
              <h3>PAYOUT / WINNER</h3>
              <p className="stat-value">
                {players.length > 0 ? (Number(jackpot) / Math.min(players.length, 5)).toFixed(6) : "0.0"} ETH
              </p>
            </div>
          </div>

          <div className="players-section">
            <h3>🏆 CURRENT ROUND - LAST 5 SENDERS (WINNERS) 🏆</h3>
            <div className="players-list">
              {players.length === 0 ? (
                <p className="no-players">No deposits yet in this round</p>
              ) : (
                [...players].reverse().map((p, i) => (
                  <div key={i} className="player-row">
                    <span className="player-rank">#{players.length - i}</span>
                    <span className="player-addr">
                      {p.slice(0, 6)}...{p.slice(-4)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="leaderboard-section">
            <h3>📊 ALL TRANSACTIONS - ALL ROUNDS 📊</h3>
            <div className="leaderboard-table">
              {allTransactions.length === 0 ? (
                <p className="no-transactions">No transactions yet</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Round</th>
                      <th>Sender</th>
                      <th>Amount (ETH)</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allTransactions].reverse().map((tx, i) => {
                      const rank = allTransactions.length - i
                      const isCurrentRound = tx.round === currentRound
                      const isTopFive = i < 5
                      const topFiveClass = isTopFive ? `top-${i + 1}` : ''
                      const currentRoundClass = isCurrentRound ? 'current-round' : ''
                      return (
                        <tr key={i} className={`transaction-row ${topFiveClass} ${currentRoundClass}`}>
                          <td className="tx-rank">#{rank}</td>
                          <td className="tx-round">R{tx.round}</td>
                          <td className="tx-addr">
                            {tx.player.slice(0, 6)}...{tx.player.slice(-4)}
                          </td>
                          <td className="tx-amount">{Number(tx.amount).toFixed(8)}</td>
                          <td className="tx-time">{new Date(tx.timestamp * 1000).toLocaleTimeString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
