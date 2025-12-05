import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import JackpotABI from './Jackpot.json'
import './App.css'

const CONTRACT_ADDRESS = "0xE12e600Dc819db49C21F986EEEE0986c6EEdedd1" // Updated with token validation
const SEPOLIA_RPC = "https://sepolia.infura.io/v3/ae6a607117bb46a3b601aece79638d75" // Public RPC

function App() {
  const [contract, setContract] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0) // Changed from timeLeft to elapsedTime
  const [players, setPlayers] = useState([])
  const [jackpot, setJackpot] = useState("0")
  const [endTime, setEndTime] = useState(0)
  const [startTime, setStartTime] = useState(0) // Track start time for local timer
  const [allTransactions, setAllTransactions] = useState([])
  const [currentRound, setCurrentRound] = useState(1)
  const [copied, setCopied] = useState(false)
  const [payoutHistory, setPayoutHistory] = useState([])
  const [acceptedToken, setAcceptedToken] = useState("0x0000000000000000000000000000000000000000")
  const [minimumDeposit, setMinimumDeposit] = useState("0.001")

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

  // Local countdown timer - continuously running upward
  useEffect(() => {
    if (endTime > 0 && startTime > 0) {
      if (timerRef.current) clearInterval(timerRef.current)

      timerRef.current = setInterval(() => {
        const now = Math.floor(Date.now() / 1000)

        if (now >= endTime) {
          // Game ended, show max time (10:00)
          setElapsedTime(600)
          fetchGameState()
        } else {
          // Calculate elapsed time
          const elapsed = now - startTime
          setElapsedTime(Math.min(elapsed, 600)) // Cap at 10 minutes
        }
      }, 1000)

      return () => clearInterval(timerRef.current)
    }
  }, [endTime, startTime])

  const initContract = async () => {
    try {
      // Use public RPC provider (read-only, no wallet needed)
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC)
      const jackpotContract = new ethers.Contract(CONTRACT_ADDRESS, JackpotABI.abi, provider)
      setContract(jackpotContract)

      // Listen to events
      jackpotContract.on("Deposit", () => fetchGameState())
      jackpotContract.on("WinnersPaid", (winners, amountPerWinner, round) => {
        console.log("WinnersPaid event:", { winners, amountPerWinner: ethers.formatEther(amountPerWinner), round: round.toString() })
        fetchGameState()
        fetchPayoutHistory()
      })
      jackpotContract.on("RoundStarted", () => fetchGameState())
      jackpotContract.on("RoundEnded", () => fetchGameState())

      // Fetch initial payout history
      fetchPayoutHistory()
    } catch (error) {
      console.error("Error initializing contract:", error)
    }
  }

  const fetchGameState = async () => {
    if (!contract) return
    try {
      const state = await contract.getGameState()

      const elapsed = Number(state[0]) // Now returns elapsed time
      const currentPlayers = state[1]
      const currentJackpot = ethers.formatEther(state[2])
      const endTimestamp = Number(state[3])
      const round = Number(state[4])

      setPlayers(currentPlayers)
      setJackpot(currentJackpot)
      setEndTime(endTimestamp)
      setCurrentRound(round)

      // Fetch actual startTime from contract (don't calculate it)
      if (endTimestamp > 0) {
        const contractStartTime = await contract.startTime()
        setStartTime(Number(contractStartTime))
      } else {
        setStartTime(0)
      }

      // Set elapsed time from contract
      setElapsedTime(elapsed)

      // Fetch token validation settings
      const token = await contract.acceptedToken()
      const minDeposit = await contract.minimumDeposit()
      setAcceptedToken(token)
      setMinimumDeposit(ethers.formatEther(minDeposit))

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

  const fetchPayoutHistory = async () => {
    if (!contract) return
    try {
      // Query WinnersPaid events from the contract
      const filter = contract.filters.WinnersPaid()
      const events = await contract.queryFilter(filter, 0, 'latest')

      // Expand each payout event into individual winner entries
      const allWinnerPayouts = []

      for (const event of events) {
        const round = Number(event.args.round)
        const winners = event.args.winners
        const amountPerWinner = ethers.formatEther(event.args.amountPerWinner)
        const txHash = event.transactionHash

        // Create an entry for each winner
        winners.forEach(winner => {
          allWinnerPayouts.push({
            round,
            winner,
            amount: amountPerWinner,
            transactionHash: txHash
          })
        })
      }

      // Sort by round descending (most recent first)
      allWinnerPayouts.sort((a, b) => b.round - a.round)
      setPayoutHistory(allWinnerPayouts)
      console.log("Payout history (expanded):", allWinnerPayouts)
    } catch (error) {
      console.error("Error fetching payout history:", error)
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

          {/* Token Validation Info */}
          <div className="contract-address-section" style={{ marginTop: '20px' }}>
            <h3 className="send-instruction">⚙️ GAME REQUIREMENTS</h3>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <div className="stat-card" style={{ flex: '1', minWidth: '200px' }}>
                <h3>ACCEPTED TOKEN</h3>
                <p className="stat-value" style={{ fontSize: '0.9em' }}>
                  {acceptedToken === "0x0000000000000000000000000000000000000000" ? "Native ETH" : `${acceptedToken.slice(0, 6)}...${acceptedToken.slice(-4)}`}
                </p>
              </div>
              <div className="stat-card" style={{ flex: '1', minWidth: '200px' }}>
                <h3>MINIMUM DEPOSIT</h3>
                <p className="stat-value">{minimumDeposit} ETH</p>
              </div>
            </div>
          </div>

          <div className="round-indicator">
            <span className="round-label">ROUND</span>
            <span className="round-number">#{currentRound}</span>
          </div>

          <div className="timer-section">
            <div className={`timer-display ${elapsedTime >= 540 && endTime > 0 ? 'critical' : ''}`}>
              {endTime === 0 ? "00:00" : formatTime(elapsedTime)}
            </div>
            <p className="timer-label">
              {endTime === 0 ? "WAITING FOR FIRST PLAYER" : "ELAPSED TIME"}
            </p>

            {/* Extension Notice - Active after 9 minutes (540 seconds elapsed) */}
            {elapsedTime >= 540 && elapsedTime < 600 && endTime > 0 && (
              <p className="extension-notice">⚡ DEAD ZONE ACTIVE (Resets: 9:03 → 9:06 → 9:09...) ⚡</p>
            )}

            {/* Waiting for Trigger Notice */}
            {elapsedTime >= 600 && endTime > 0 && (
              <div className="waiting-notice-container">
                <p className="waiting-notice">⏳ ROUND ENDED ⏳</p>
                <p className="waiting-subtext">Next deposit will trigger payout & start new round!</p>
              </div>
            )}

            {/* Idle Notice */}
            {endTime === 0 && (
              <p className="waiting-notice">🚀 SEND ETH TO START ROUND 1 🚀</p>
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
                {players.length > 0 ? ((Number(jackpot) * 0.9) / Math.min(players.length, 5)).toFixed(6) : "0.0"} ETH
              </p>
              <p style={{ fontSize: '0.7em', opacity: 0.7, marginTop: '4px' }}>(After 10% fee)</p>
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

          {/* New Top Depositors Leaderboard */}
          <div className="leaderboard-section">
            <h3>� TOP DEPOSITORS (ALL TIME) 👑</h3>
            <div className="leaderboard-table">
              {(() => {
                // Aggregate deposits by player
                const playerTotals = {};
                allTransactions.forEach(tx => {
                  const amount = parseFloat(tx.amount);
                  if (playerTotals[tx.player]) {
                    playerTotals[tx.player] += amount;
                  } else {
                    playerTotals[tx.player] = amount;
                  }
                });

                // Convert to array and sort
                const sortedPlayers = Object.entries(playerTotals)
                  .map(([player, total]) => ({ player, total }))
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 10); // Top 10

                if (sortedPlayers.length === 0) {
                  return <p className="no-transactions">No deposits yet</p>;
                }

                return (
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Total Deposited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p, i) => (
                        <tr key={i} className={`transaction-row ${i < 3 ? `top-${i + 1}` : ''}`}>
                          <td className="tx-rank">#{i + 1}</td>
                          <td className="tx-addr">
                            {p.player.slice(0, 6)}...{p.player.slice(-4)}
                          </td>
                          <td className="tx-amount">{p.total.toFixed(4)} ETH</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          <div className="leaderboard-section">
            <h3>📊 TRANSACTION HISTORY 📊</h3>
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
                      <th>Amount</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allTransactions].reverse().map((tx, i) => {
                      const rank = allTransactions.length - i
                      const isCurrentRound = tx.round === currentRound
                      const currentRoundClass = isCurrentRound ? 'current-round' : ''
                      return (
                        <tr key={i} className={`transaction-row ${currentRoundClass}`}>
                          <td className="tx-rank">#{rank}</td>
                          <td className="tx-round">R{tx.round}</td>
                          <td className="tx-addr">
                            {tx.player.slice(0, 6)}...{tx.player.slice(-4)}
                          </td>
                          <td className="tx-amount">{Number(tx.amount).toFixed(4)}</td>
                          <td className="tx-time">{new Date(tx.timestamp * 1000).toLocaleTimeString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Payout History Table */}
          <div className="leaderboard-section">
            <h3>💰 PAYOUT HISTORY 💰</h3>
            <div className="leaderboard-table">
              {payoutHistory.length === 0 ? (
                <p className="no-transactions">No payouts yet</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Round</th>
                      <th>Winner</th>
                      <th>Amount</th>
                      <th>Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutHistory.map((payout, i) => (
                      <tr key={i} className="transaction-row">
                        <td className="tx-rank">#{i + 1}</td>
                        <td className="tx-round">R{payout.round}</td>
                        <td className="tx-addr">
                          {payout.winner.slice(0, 6)}...{payout.winner.slice(-4)}
                        </td>
                        <td className="tx-amount">{Number(payout.amount).toFixed(4)} ETH</td>
                        <td className="tx-time">
                          <a
                            href={`https://sepolia.etherscan.io/tx/${payout.transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#4CAF50', textDecoration: 'none' }}
                          >
                            {payout.transactionHash.slice(0, 6)}...{payout.transactionHash.slice(-4)}
                          </a>
                        </td>
                      </tr>
                    ))}
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
