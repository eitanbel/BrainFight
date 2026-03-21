import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update, runTransaction } from 'firebase/database'
import { db } from '../firebase'
import './Game.css'

const QUESTION_TIME_BY_MODE = {
  classique: 10, vrai_ou_faux: 10, estimation: 20,
  contre_la_montre: 8, qui_est_le_plus: 15,
}
const REVEAL_TIME_BY_MODE = {
  classique: 3000, vrai_ou_faux: 3000, estimation: 3000,
  contre_la_montre: 1000, qui_est_le_plus: 4000,
}
const GLOBAL_TIMER_CTM = 90 // 1 minute 30

export default function Game() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const pseudo = searchParams.get('pseudo') || ''
  const navigate = useNavigate()

  const [salon, setSalon] = useState(null)
  const [timerPercent, setTimerPercent] = useState(100)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [phase, setPhase] = useState('playing')
  const [pendingCorrect, setPendingCorrect] = useState(false)
  const [pendingScore, setPendingScore] = useState(0)
  const [estimationInput, setEstimationInput] = useState('')
  const [globalTimeLeft, setGlobalTimeLeft] = useState(GLOBAL_TIMER_CTM)
  const [transitioning, setTransitioning] = useState(false)

  const questionIndexRef = useRef(-1)
  const salonRef = useRef(null)

  // Firebase listener
  useEffect(() => {
    const unsub = onValue(ref(db, `salons/${code}`), (snap) => {
      if (!snap.exists()) return
      const data = snap.val()
      setSalon(data)
      salonRef.current = data
      if (data.statut === 'termine') {
        navigate(`/results/${code}?pseudo=${encodeURIComponent(pseudo)}`)
      }
    })
    return () => unsub()
  }, [code, pseudo, navigate])

  // Reset on question change
  useEffect(() => {
    if (!salon) return
    const idx = salon.questionActuelle
    if (idx !== questionIndexRef.current) {
      questionIndexRef.current = idx
      setHasAnswered(false)
      setSelectedAnswer(null)
      setPendingCorrect(false)
      setPendingScore(0)
      setEstimationInput('')
      setPhase('playing')
      setTimerPercent(100)
      setTransitioning(false)
    }
  }, [salon?.questionActuelle])

  // Flush score at reveal
  useEffect(() => {
    if (phase !== 'reveal') return
    const mode = salonRef.current?.mode || 'classique'
    if (mode === 'qui_est_le_plus') {
      if (selectedAnswer) {
        runTransaction(ref(db, `salons/${code}/joueurs/${selectedAnswer}`), (p) => {
          if (!p) return p
          p.score = (p.score || 0) + 1
          return p
        })
      }
    } else if (mode === 'estimation') {
      if (pendingScore > 0) {
        runTransaction(ref(db, `salons/${code}/joueurs/${pseudo}`), (p) => {
          if (!p) return p
          p.score = (p.score || 0) + pendingScore
          return p
        })
      }
    } else {
      if (pendingCorrect) {
        runTransaction(ref(db, `salons/${code}/joueurs/${pseudo}`), (p) => {
          if (!p) return p
          p.score = (p.score || 0) + 1
          return p
        })
      }
    }
  }, [phase, pendingCorrect, pendingScore, selectedAnswer])

  // Global timer for contre_la_montre
  useEffect(() => {
    if (!salon?.timerGlobalDepart || salon?.mode !== 'contre_la_montre') return
    const timerGlobalDepart = salon.timerGlobalDepart
    let rafId
    const tick = () => {
      const elapsed = (Date.now() - timerGlobalDepart) / 1000
      const remaining = Math.max(0, GLOBAL_TIMER_CTM - elapsed)
      setGlobalTimeLeft(Math.floor(remaining))
      if (remaining <= 0) {
        runTransaction(ref(db, `salons/${code}`), (d) => {
          if (!d || d.statut !== 'en_cours') return d
          d.statut = 'termine'
          return d
        })
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [salon?.timerGlobalDepart])

  // Per-question timer (RAF)
  useEffect(() => {
    if (!salon?.timerDepart) return
    const timerDepart = salon.timerDepart
    const questionActuelle = salon.questionActuelle
    const totalQuestions = salon.questions?.length ?? 10
    const mode = salon.mode || 'classique'
    const questionTime = QUESTION_TIME_BY_MODE[mode] || 10
    const revealTime = REVEAL_TIME_BY_MODE[mode] || 3000
    let triggered = false
    let rafId

    const tick = () => {
      const elapsed = (Date.now() - timerDepart) / 1000
      const remaining = Math.max(0, questionTime - elapsed)
      setTimerPercent((remaining / questionTime) * 100)

      const cur = salonRef.current
      const allAnswered = mode === 'contre_la_montre' && cur?.joueurs &&
        Object.values(cur.joueurs).every(j => j.reponses?.[questionActuelle] !== undefined)

      if ((remaining <= 0 || allAnswered) && !triggered) {
        triggered = true
        setPhase('reveal')
        if (revealTime > 350) setTimeout(() => setTransitioning(true), revealTime - 350)
        setTimeout(() => advanceQuestion(questionActuelle, totalQuestions), revealTime)
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [salon?.timerDepart, salon?.questionActuelle])

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

  const handleAnswer = async (value) => {
    if (phase === 'reveal') return
    const mode = salonRef.current?.mode || 'classique'
    setHasAnswered(true)
    setSelectedAnswer(value)
    if (mode !== 'qui_est_le_plus') {
      const question = salon.questions[salon.questionActuelle]
      setPendingCorrect(value === question.reponse)
    }
    await update(ref(db, `salons/${code}`), {
      [`joueurs/${pseudo}/reponses/${salon.questionActuelle}`]: value,
    })
  }

  const handleEstimationSubmit = async () => {
    if (phase === 'reveal' || !estimationInput) return
    const valeur = parseInt(estimationInput, 10)
    if (isNaN(valeur)) return
    const question = salon.questions[salon.questionActuelle]
    const correct = question.reponse
    const ecart = Math.abs(correct) > 0 ? Math.abs(valeur - correct) / Math.abs(correct) : (valeur === correct ? 0 : 1)
    const pts = valeur === correct ? 3 : ecart <= 0.10 ? 2 : ecart <= 0.25 ? 1 : 0
    setHasAnswered(true)
    setSelectedAnswer(valeur)
    setPendingScore(pts)
    await update(ref(db, `salons/${code}`), {
      [`joueurs/${pseudo}/reponses/${salon.questionActuelle}`]: valeur,
    })
  }

  if (!salon?.questions) {
    return <div className="game"><p className="game-loading">Chargement...</p></div>
  }

  const mode = salon.mode || 'classique'
  const qIndex = salon.questionActuelle
  const question = salon.questions[qIndex]
  const total = salon.questions.length
  const timerColor = timerPercent > 60 ? '#4ade80' : timerPercent > 30 ? '#fbbf24' : '#f87171'
  const isReveal = phase === 'reveal'
  const hasRightWrong = ['classique', 'vrai_ou_faux', 'contre_la_montre'].includes(mode)
  const wasCorrect = hasRightWrong ? selectedAnswer === question.reponse : false

  // ── Render choices ──
  const renderChoices = () => {
    if (mode === 'vrai_ou_faux') {
      return (
        <div className="game-tf-choices">
          {[true, false].map((val) => {
            let cls = 'game-tf-btn'
            if (!isReveal) {
              if (selectedAnswer === val) cls += ' picked'
            } else {
              if (val === question.reponse) cls += ' correct' + (wasCorrect && selectedAnswer === val ? ' celebrate' : '')
              else if (selectedAnswer === val) cls += ' wrong'
              else cls += ' dimmed'
            }
            return (
              <button key={String(val)} className={cls} onClick={() => handleAnswer(val)} disabled={isReveal}>
                {val ? '✅ VRAI' : '❌ FAUX'}
              </button>
            )
          })}
        </div>
      )
    }

    if (mode === 'estimation') {
      if (isReveal) {
        return (
          <div className="game-estimation-reveal">
            <p className="game-estimation-answer">✅ Réponse : <strong>{question.reponse.toLocaleString()}</strong></p>
            {selectedAnswer !== null && (
              <p className="game-estimation-mine">
                Ta réponse : {selectedAnswer.toLocaleString()}
                {' '}<span className={`game-estimation-pts pts-${pendingScore}`}>+{pendingScore} pt{pendingScore > 1 ? 's' : ''}</span>
              </p>
            )}
            <div className="game-estimation-others">
              {Object.entries(salon.joueurs || {}).filter(([nom]) => nom !== pseudo).map(([nom, data]) => {
                const val = data.reponses?.[qIndex]
                if (val === undefined) return null
                return (
                  <div key={nom} className="game-estimation-other">
                    <span>{nom}</span>
                    <span>{val.toLocaleString()} <span className="game-estimation-ecart">(±{Math.abs(val - question.reponse).toLocaleString()})</span></span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }
      return (
        <div className="game-estimation">
          <input
            className="game-estimation-input"
            type="number"
            placeholder="Votre estimation..."
            value={estimationInput}
            onChange={e => {
              setEstimationInput(e.target.value)
              if (hasAnswered) { setHasAnswered(false); setSelectedAnswer(null); setPendingScore(0) }
            }}
            onKeyDown={e => e.key === 'Enter' && handleEstimationSubmit()}
            disabled={isReveal}
          />
          <button
            className={`game-estimation-submit${hasAnswered ? ' validated' : ''}`}
            onClick={handleEstimationSubmit}
            disabled={!estimationInput || isReveal}
          >
            {hasAnswered ? '✓ Réponse enregistrée' : '📤 Valider'}
          </button>
        </div>
      )
    }

    if (mode === 'qui_est_le_plus') {
      if (isReveal) {
        const votes = {}
        Object.values(salon.joueurs || {}).forEach(j => {
          const vote = j.reponses?.[qIndex]
          if (vote != null) votes[vote] = (votes[vote] || 0) + 1
        })
        const maxVotes = Math.max(0, ...Object.values(votes))
        return (
          <div className="game-votes-reveal">
            {Object.keys(salon.joueurs || {}).map(nom => {
              const v = votes[nom] || 0
              return (
                <div key={nom} className={`game-vote-result ${v > 0 && v === maxVotes ? 'game-vote-winner' : ''}`}>
                  <span className="game-vote-result-name">{nom}</span>
                  <div className="game-vote-bar-wrap">
                    <div className="game-vote-bar-fill" style={{ width: maxVotes > 0 ? `${(v / maxVotes) * 100}%` : '0%' }} />
                  </div>
                  <span className="game-vote-result-count">{v} vote{v !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        )
      }
      const players = Object.keys(salon.joueurs || {}).filter(n => n !== pseudo)
      return (
        <div className="game-vote-choices">
          {players.map(nom => (
            <button
              key={nom}
              className={`game-vote-btn${selectedAnswer === nom ? ' picked' : ''}`}
              onClick={() => handleAnswer(nom)}
              disabled={isReveal}
            >
              <span className="game-vote-avatar">{nom[0].toUpperCase()}</span>
              <span>{nom}</span>
            </button>
          ))}
        </div>
      )
    }

    // classique & contre_la_montre
    return (
      <div className="game-choices">
        {question.choix.map((choix, i) => {
          let cls = 'game-choice'
          if (!isReveal) {
            if (i === selectedAnswer) cls += ' picked'
          } else {
            if (i === question.reponse) cls += ' correct' + (wasCorrect ? ' celebrate' : '')
            else if (i === selectedAnswer && i !== question.reponse) cls += ' wrong'
            else cls += ' dimmed'
          }
          return (
            <button key={i} className={cls} onClick={() => handleAnswer(i)} disabled={isReveal}>
              <span className="game-choice-letter">{['A', 'B', 'C', 'D'][i]}</span>
              <span className="game-choice-text">{choix}</span>
              {isReveal && i === question.reponse && wasCorrect && <span className="game-choice-check">✓</span>}
            </button>
          )
        })}
      </div>
    )
  }

  const renderFeedback = () => {
    if (!isReveal || mode === 'qui_est_le_plus' || mode === 'estimation') return null
    return (
      <div className={`game-reveal ${wasCorrect ? 'game-reveal-correct' : hasAnswered ? 'game-reveal-wrong' : 'game-reveal-missed'}`}>
        {wasCorrect ? '🎉 Bonne réponse !' : hasAnswered ? '❌ Raté !' : '⏰ Temps écoulé !'}
      </div>
    )
  }

  const scoreLabel = mode === 'qui_est_le_plus' ? 'vote' : 'pt'
  const scoreTitle = mode === 'qui_est_le_plus' ? 'Votes reçus' : 'Classement'

  return (
    <div className="game">
      {/* Header */}
      <div className="game-header">
        <span className="game-progress">
          {mode === 'contre_la_montre' ? (
            <span className={`game-global-timer${globalTimeLeft < 30 ? ' game-global-timer-urgent' : ''}`}>
              ⏱ {Math.floor(globalTimeLeft / 60)}:{String(globalTimeLeft % 60).padStart(2, '0')}
            </span>
          ) : (
            <span className="game-progress-dots">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={`game-dot ${i < qIndex ? 'game-dot-done' : i === qIndex ? 'game-dot-current' : ''}`}
                />
              ))}
            </span>
          )}
        </span>
        <div className="game-timer-bar">
          <div
            className={`game-timer-fill${timerPercent < 30 ? ' game-timer-fill-urgent' : ''}`}
            style={{ width: `${timerPercent}%`, background: timerColor }}
          />
        </div>
      </div>

      {/* Question + Choices + Feedback */}
      <div key={qIndex} className={`game-question-wrap ${transitioning ? 'game-slide-out' : 'game-slide-in'}`}>
        <div className="game-question-card">
          <p className="game-question">{question.question}</p>
        </div>
        {renderChoices()}
        {renderFeedback()}
      </div>

      {/* Mini-classement */}
      {(() => {
        const sorted = Object.entries(salon.joueurs || {})
          .map(([nom, d]) => ({ nom, score: d.score ?? 0 }))
          .sort((a, b) => b.score - a.score)
        const rankIcons = ['🥇', '🥈', '🥉']
        return (
          <div className="game-scores">
            <p className="game-scores-title">{scoreTitle}</p>
            {sorted.map((j, i) => (
              <div key={j.nom} className={`game-score-item ${j.nom === pseudo ? 'game-score-me' : ''}`}>
                <span className="game-score-rank">{rankIcons[i] ?? `#${i + 1}`}</span>
                <span className="game-score-name">{j.nom}</span>
                <span className="game-score-pts">{j.score} {scoreLabel}{j.score !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
