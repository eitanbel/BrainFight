import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update, remove } from 'firebase/database'
import { db } from '../firebase'
import { generateQuestions, generateQuestionsTrueFalse, generateQuestionsEstimation } from '../claude'
import './Results.css'

export default function Results() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const pseudo = searchParams.get('pseudo') || ''
  const navigate = useNavigate()

  const [classement, setClassement] = useState([])
  const [salon, setSalon] = useState(null)
  const [mode, setMode] = useState('menu') // 'menu' | 'newTheme'
  const [newTheme, setNewTheme] = useState('')
  const [newDifficulte, setNewDifficulte] = useState('moyen')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  const DIFFICULTIES = [
    { value: 'facile', label: 'Facile' },
    { value: 'moyen', label: 'Moyen' },
    { value: 'difficile', label: 'Difficile' },
  ]

  useEffect(() => {
    const unsub = onValue(ref(db, `salons/${code}`), (snap) => {
      if (!snap.exists()) return
      const data = snap.val()
      setSalon(data)

      const joueurs = Object.entries(data.joueurs || {})
        .map(([nom, info]) => ({ nom, score: info.score ?? 0 }))
        .sort((a, b) => b.score - a.score)
      setClassement(joueurs)

      if (data.statut === 'attente') {
        navigate(`/lobby/${code}?pseudo=${encodeURIComponent(pseudo)}`)
      }
    })
    return () => unsub()
  }, [code, pseudo, navigate])

  const resetAndRestart = async (theme, difficulte, nombre) => {
    setLoading(true)
    setLoadingMsg('Génération de nouvelles questions...')
    try {
      const gameMode = salon?.mode || 'classique'
      let questions
      if (gameMode === 'vrai_ou_faux') questions = await generateQuestionsTrueFalse(theme, difficulte, nombre)
      else if (gameMode === 'estimation') questions = await generateQuestionsEstimation(theme, difficulte, nombre)
      else questions = await generateQuestions(theme, difficulte, nombre)
      const updates = {
        questions,
        theme,
        difficulte,
        nombreQuestions: nombre,
        statut: 'attente',
        questionActuelle: 0,
        timerDepart: null,
      }
      Object.keys(salon.joueurs || {}).forEach((nom) => {
        updates[`joueurs/${nom}/score`] = 0
        updates[`joueurs/${nom}/reponses`] = null
      })
      await update(ref(db, `salons/${code}`), updates)
    } catch (err) {
      console.error(err)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const handleSameTheme = () => {
    if (!salon) return
    resetAndRestart(salon.theme, salon.difficulte || 'moyen', salon.nombreQuestions || 10)
  }

  const handleNewThemeSubmit = () => {
    if (!newTheme.trim()) return
    resetAndRestart(newTheme.trim(), newDifficulte, salon?.nombreQuestions || 10)
  }

  const enterNewThemeMode = () => {
    setNewDifficulte(salon?.difficulte || 'moyen')
    setMode('newTheme')
  }

  const handleQuit = async () => {
    await remove(ref(db, `salons/${code}/joueurs/${pseudo}`))
    navigate('/')
  }

  const medals = ['🥇', '🥈', '🥉']
  const gameMode = salon?.mode || 'classique'
  const isWhoIs = gameMode === 'qui_est_le_plus'
  const scoreUnit = isWhoIs ? 'vote' : 'pt'
  const resultsTitle = isWhoIs ? '👥 Le plus désigné de la soirée !' : '🧠 BrainFight — Résultats'

  return (
    <div className="results">
      <h1 className="results-title">{resultsTitle}</h1>

      <div className="results-podium">
        {classement.slice(0, 3).map((j, i) => (
          <div key={j.nom} className={`results-podium-item podium-${i + 1}`}>
            <span className="results-medal">{medals[i]}</span>
            <span className="results-podium-name">{j.nom}</span>
            <span className="results-podium-score">{j.score} {scoreUnit}{j.score !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      {classement.length > 3 && (
        <div className="results-card">
          {classement.slice(3).map((j, i) => (
            <div key={j.nom} className={`results-row ${j.nom === pseudo ? 'results-row-me' : ''}`}>
              <span className="results-rank">{i + 4}.</span>
              <span className="results-name">{j.nom}</span>
              <span className="results-score">{j.score} {scoreUnit}{j.score !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="results-loading">⏳ {loadingMsg}</p>
      ) : mode === 'menu' ? (
        <div className="results-actions">
          {!isWhoIs && (
            <button className="results-btn results-btn-primary" onClick={handleSameTheme}>
              🔄 Recommencer avec le même thème
            </button>
          )}
          {!isWhoIs && (
            <button className="results-btn results-btn-secondary" onClick={enterNewThemeMode}>
              🎨 Changer de thème
            </button>
          )}
          {isWhoIs && (
            <button className="results-btn results-btn-primary" onClick={handleSameTheme}>
              🔄 Rejouer avec le même groupe
            </button>
          )}
          <button className="results-btn results-btn-ghost" onClick={handleQuit}>
            🚪 Quitter la partie
          </button>
        </div>
      ) : (
        <div className="results-new-theme">
          <input
            className="results-input"
            type="text"
            placeholder="Quel est le nouveau thème ?"
            value={newTheme}
            onChange={(e) => setNewTheme(e.target.value)}
            maxLength={50}
          />
          <p className="results-diff-label">Difficulté</p>
          <div className="results-difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                className={`results-diff-btn ${newDifficulte === d.value ? 'results-diff-active' : ''}`}
                onClick={() => setNewDifficulte(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button className="results-btn results-btn-primary" onClick={handleNewThemeSubmit}>
            ✅ Valider
          </button>
          <button className="results-btn results-btn-ghost" onClick={() => setMode('menu')}>
            ← Retour
          </button>
        </div>
      )}
    </div>
  )
}
