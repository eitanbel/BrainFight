import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update, runTransaction } from 'firebase/database'
import { db } from '../firebase'
import './Game.css'

const QUESTION_TIME = 10
const REVEAL_TIME = 3000

export default function Game() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const pseudo = searchParams.get('pseudo') || ''
  const navigate = useNavigate()

  const [salon, setSalon] = useState(null)
  const [timerPercent, setTimerPercent] = useState(100)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [phase, setPhase] = useState('playing') // 'playing' | 'reveal'
  const [pendingCorrect, setPendingCorrect] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const questionIndexRef = useRef(-1)

  useEffect(() => {
    const unsub = onValue(ref(db, `salons/${code}`), (snap) => {
      if (!snap.exists()) return
      const data = snap.val()
      setSalon(data)
      if (data.statut === 'termine') {
        navigate(`/results/${code}?pseudo=${encodeURIComponent(pseudo)}`)
      }
    })
    return () => unsub()
  }, [code, pseudo, navigate])

  // Reset state when question changes
  useEffect(() => {
    if (!salon) return
    const idx = salon.questionActuelle
    if (idx !== questionIndexRef.current) {
      questionIndexRef.current = idx
      setHasAnswered(false)
      setSelectedAnswer(null)
      setPendingCorrect(false)
      setPhase('playing')
      setTimerPercent(100)
      setTransitioning(false)
    }
  }, [salon?.questionActuelle])

  // Flush pending score to Firebase when reveal starts
  const flushScore = async (qIdx) => {
    await runTransaction(ref(db, `salons/${code}/joueurs/${pseudo}`), (player) => {
      if (!player) return player
      player.score = (player.score || 0) + 1
      return player
    })
  }

  // Timer — requestAnimationFrame pour une animation fluide
  useEffect(() => {
    if (!salon?.timerDepart) return
    const timerDepart = salon.timerDepart
    const questionActuelle = salon.questionActuelle
    const totalQuestions = salon.questions?.length ?? 10
    let triggered = false
    let rafId

    const tick = () => {
      const elapsed = (Date.now() - timerDepart) / 1000
      const remaining = Math.max(0, QUESTION_TIME - elapsed)
      const percent = (remaining / QUESTION_TIME) * 100
      setTimerPercent(percent)

      if (remaining <= 0 && !triggered) {
        triggered = true
        setPhase('reveal')
        // Slide-out 350ms avant le changement de question
        setTimeout(() => setTransitioning(true), REVEAL_TIME - 350)
        setTimeout(() => {
          advanceQuestion(questionActuelle, totalQuestions)
        }, REVEAL_TIME)
        return // arrête le RAF
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [salon?.timerDepart, salon?.questionActuelle])

  // Flush pending correct answer when reveal starts
  useEffect(() => {
    if (phase === 'reveal' && pendingCorrect) {
      flushScore(questionIndexRef.current)
    }
  }, [phase, pendingCorrect])

  const advanceQuestion = async (currentIndex, totalQuestions) => {
    await runTransaction(ref(db, `salons/${code}`), (data) => {
      if (!data) return data
      if (data.questionActuelle !== currentIndex) return data
      const next = currentIndex + 1
      if (next >= totalQuestions) {
        data.statut = 'termine'
      } else {
        data.questionActuelle = next
        data.timerDepart = Date.now()
      }
      return data
    })
  }

  const handleAnswer = async (choixIndex) => {
    if (phase === 'reveal') return
    setHasAnswered(true)
    setSelectedAnswer(choixIndex)

    const question = salon.questions[salon.questionActuelle]
    const isCorrect = choixIndex === question.reponse

    // Always update pendingCorrect based on the latest selection
    setPendingCorrect(isCorrect)

    // Record answer choice in Firebase (but NOT the score yet)
    await update(ref(db, `salons/${code}`), {
      [`joueurs/${pseudo}/reponses/${salon.questionActuelle}`]: choixIndex,
    })
  }

  if (!salon?.questions) {
    return <div className="game"><p className="game-loading">Chargement...</p></div>
  }

  const qIndex = salon.questionActuelle
  const question = salon.questions[qIndex]
  const total = salon.questions.length
  const timerColor = timerPercent > 60 ? '#4ade80' : timerPercent > 30 ? '#fbbf24' : '#f87171'

  const isReveal = phase === 'reveal'
  const wasCorrect = selectedAnswer === question.reponse

  const getChoiceClass = (i) => {
    let cls = 'game-choice'
    // Phase playing: highlight selected, all others remain active
    if (!isReveal) {
      if (i === selectedAnswer) return cls + ' picked'
      return cls
    }
    // Phase reveal: show correct/wrong
    if (i === question.reponse) return cls + ' correct' + (wasCorrect ? ' celebrate' : '')
    if (i === selectedAnswer && i !== question.reponse) return cls + ' wrong'
    return cls + ' dimmed'
  }

  return (
    <div className="game">
      {/* Header timer */}
      <div className="game-header">
        <span className="game-progress">Q{qIndex + 1} / {total}</span>
        <div className="game-timer-bar">
          <div
            className="game-timer-fill"
            style={{ width: `${timerPercent}%`, background: timerColor }}
          />
        </div>
      </div>

      {/* Question + Choix + Reveal (animés ensemble) */}
      <div
        key={qIndex}
        className={`game-question-wrap ${transitioning ? 'game-slide-out' : 'game-slide-in'}`}
      >
        <div className="game-question-card">
          <p className="game-question">{question.question}</p>
        </div>

        <div className="game-choices">
          {question.choix.map((choix, i) => (
            <button
              key={i}
              className={getChoiceClass(i)}
              onClick={() => handleAnswer(i)}
              disabled={isReveal}
            >
              <span className="game-choice-letter">{['A', 'B', 'C', 'D'][i]}</span>
              <span className="game-choice-text">{choix}</span>
              {isReveal && i === question.reponse && wasCorrect && (
                <span className="game-choice-check">✓</span>
              )}
            </button>
          ))}
        </div>

        {isReveal && (
          <div className={`game-reveal ${wasCorrect ? 'game-reveal-correct' : hasAnswered ? 'game-reveal-wrong' : 'game-reveal-missed'}`}>
            {wasCorrect ? '🎉 Bonne réponse !' : hasAnswered ? '❌ Raté !' : '⏰ Temps écoulé !'}
          </div>
        )}
      </div>

      {/* Mini-classement */}
      {(() => {
        const sorted = Object.entries(salon.joueurs || {})
          .map(([nom, d]) => ({ nom, score: d.score ?? 0 }))
          .sort((a, b) => b.score - a.score)
        const top3 = sorted.slice(0, 3)
        const meInTop3 = top3.some((j) => j.nom === pseudo)
        const meEntry = !meInTop3 ? sorted.find((j) => j.nom === pseudo) : null
        const meRank = !meInTop3 ? sorted.findIndex((j) => j.nom === pseudo) + 1 : null
        return (
          <div className="game-scores">
            <p className="game-scores-title">Classement</p>
            {top3.map((j, i) => (
              <div key={j.nom} className={`game-score-item ${j.nom === pseudo ? 'game-score-me' : ''}`}>
                <span className="game-score-rank">{['🥇', '🥈', '🥉'][i]}</span>
                <span className="game-score-name">{j.nom}</span>
                <span className="game-score-pts">{j.score} pt{j.score !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {meEntry && (
              <>
                <div className="game-score-separator">···</div>
                <div className="game-score-item game-score-me">
                  <span className="game-score-rank">#{meRank}</span>
                  <span className="game-score-name">{meEntry.nom}</span>
                  <span className="game-score-pts">{meEntry.score} pt{meEntry.score !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
