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
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [phase, setPhase] = useState('playing') // 'playing' | 'reveal'
  const [pendingCorrect, setPendingCorrect] = useState(false)

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
      setTimeLeft(QUESTION_TIME)
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

  // Timer
  useEffect(() => {
    if (!salon?.timerDepart) return
    const timerDepart = salon.timerDepart
    const questionActuelle = salon.questionActuelle
    const totalQuestions = salon.questions?.length ?? 10
    let flushed = false

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerDepart) / 1000)
      const remaining = Math.max(0, QUESTION_TIME - elapsed)
      setTimeLeft(remaining)

      if (remaining === 0 && !flushed) {
        flushed = true
        clearInterval(interval)
        setPhase('reveal')

        // After reveal pause, advance to next question
        setTimeout(() => {
          advanceQuestion(questionActuelle, totalQuestions)
        }, REVEAL_TIME)
      }
    }, 200)

    return () => clearInterval(interval)
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
  const timerPercent = (timeLeft / QUESTION_TIME) * 100
  const timerColor = timeLeft > 5 ? '#4ade80' : timeLeft > 2 ? '#fbbf24' : '#f87171'

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
            style={{ width: `${timerPercent}%`, background: timerColor, transition: 'width 0.2s linear' }}
          />
        </div>
        <span className="game-timer-text" style={{ color: timerColor }}>
          {isReveal ? '✓' : `${timeLeft}s`}
        </span>
      </div>

      {/* Question */}
      <div className="game-question-card">
        <p className="game-question">{question.question}</p>
      </div>

      {/* Choix */}
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

      {/* Feedback reveal */}
      {isReveal && (
        <div className={`game-reveal ${wasCorrect ? 'game-reveal-correct' : hasAnswered ? 'game-reveal-wrong' : 'game-reveal-missed'}`}>
          {wasCorrect ? '🎉 Bonne réponse !' : hasAnswered ? '❌ Raté !' : '⏰ Temps écoulé !'}
        </div>
      )}

      {/* Scores en direct */}
      <div className="game-scores">
        <p className="game-scores-title">Scores</p>
        {Object.entries(salon.joueurs || {})
          .sort(([, a], [, b]) => b.score - a.score)
          .map(([nom, data]) => (
            <div key={nom} className={`game-score-item ${nom === pseudo ? 'game-score-me' : ''}`}>
              <span>{nom}</span>
              <span>{data.score ?? 0} pt{data.score !== 1 ? 's' : ''}</span>
            </div>
          ))}
      </div>
    </div>
  )
}
