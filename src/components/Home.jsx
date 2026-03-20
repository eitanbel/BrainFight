import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set, get } from 'firebase/database'
import { db } from '../firebase'
import { generateQuestions } from '../claude'
import './Home.css'

function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
}

const DIFFICULTIES = [
  { value: 'facile', label: 'Facile' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'difficile', label: 'Difficile' },
]

const QUESTIONS_OPTIONS = [5, 10, 15, 20]

export default function Home() {
  const navigate = useNavigate()
  const [pseudo, setPseudo] = useState('')
  const [theme, setTheme] = useState('')
  const [difficulte, setDifficulte] = useState('moyen')
  const [nombreQuestions, setNombreQuestions] = useState(10)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    if (!pseudo.trim()) { setError('Entre ton pseudo !'); return }
    if (!theme.trim()) { setError('Entre un thème !'); return }

    setLoading(true)
    setLoadingMsg('Génération des questions...')

    try {
      const questions = await generateQuestions(theme.trim(), difficulte, nombreQuestions)

      const code = generateCode()
      setLoadingMsg('Création du salon...')

      await set(ref(db, `salons/${code}`), {
        theme: theme.trim(),
        difficulte,
        nombreQuestions,
        statut: 'attente',
        questions,
        questionActuelle: 0,
        joueurs: {
          [pseudo.trim()]: { score: 0 },
        },
      })

      navigate(`/lobby/${code}?pseudo=${encodeURIComponent(pseudo.trim())}`)
    } catch (err) {
      console.error(err)
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Impossible de joindre l\'API. Vérifie ta connexion.')
      } else if (err.message?.includes('Firebase') || err.message?.includes('permission')) {
        setError('Erreur Firebase. Vérifie ta configuration.')
      } else {
        setError('Une erreur est survenue. Réessaie.')
      }
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const handleJoin = async () => {
    setError('')
    if (!pseudo.trim()) { setError('Entre ton pseudo !'); return }
    if (joinCode.trim().length < 4) { setError('Entre un code à 4 lettres !'); return }

    setLoading(true)
    setLoadingMsg('Recherche du salon...')

    try {
      const code = joinCode.trim().toUpperCase()
      const snapshot = await get(ref(db, `salons/${code}`))

      if (!snapshot.exists()) {
        setError('Code introuvable. Vérifie le code et réessaie.')
        setLoading(false)
        setLoadingMsg('')
        return
      }

      await set(ref(db, `salons/${code}/joueurs/${pseudo.trim()}`), { score: 0 })
      navigate(`/lobby/${code}?pseudo=${encodeURIComponent(pseudo.trim())}`)
    } catch (err) {
      console.error(err)
      setError('Une erreur est survenue. Réessaie.')
      setLoading(false)
      setLoadingMsg('')
    }
  }

  if (loading) {
    return (
      <div className="home-loading-screen">
        <h1 className="home-loading-title">🧠 BrainFight</h1>
        <p className="home-loading-msg">
          Chargement du champ de bataille
          <span className="home-loading-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </p>
        <div className="home-loading-bar-wrap">
          <div className="home-loading-bar" />
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">🧠 BrainFight</h1>
        <p className="home-subtitle">Et c'est parti pour le quiz !</p>
        <p className="home-credit">Developped by Eitan &amp; powered by Claude</p>
      </div>

      <div className="home-card">
        <div className="home-section">
          <label className="home-label">Ton pseudo</label>
          <input
            className="home-input"
            type="text"
            placeholder="Ex : Alexandre"
            value={pseudo}
            onChange={e => setPseudo(e.target.value)}
            maxLength={20}
            disabled={loading}
          />

          <label className="home-label">Thème de la partie</label>
          <input
            className="home-input"
            type="text"
            placeholder="Ex : cinéma des années 90"
            value={theme}
            onChange={e => setTheme(e.target.value)}
            maxLength={50}
            disabled={loading}
          />

          <label className="home-label">Difficulté</label>
          <div className="home-difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                className={`home-diff-btn ${difficulte === d.value ? 'home-diff-active' : ''}`}
                onClick={() => setDifficulte(d.value)}
                disabled={loading}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="home-label">Nombre de questions</label>
          <div className="home-difficulty">
            {QUESTIONS_OPTIONS.map((n) => (
              <button
                key={n}
                className={`home-diff-btn ${nombreQuestions === n ? 'home-diff-active' : ''}`}
                onClick={() => setNombreQuestions(n)}
                disabled={loading}
              >
                {n}
              </button>
            ))}
          </div>

          {error && <p className="home-error">{error}</p>}

          <button
            className="home-btn home-btn-primary"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? `⏳ ${loadingMsg}` : '🎮 Créer une partie'}
          </button>
        </div>

        <div className="home-separator">
          <span className="home-separator-line" />
          <span className="home-separator-text">ou</span>
          <span className="home-separator-line" />
        </div>

        <div className="home-section">
          <label className="home-label">Code de la partie</label>
          <input
            className="home-input home-input-code"
            type="text"
            placeholder="Ex : AB3X"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={4}
            disabled={loading}
          />

          {error && !loading && <p className="home-error">{error}</p>}

          <button className="home-btn home-btn-secondary" onClick={handleJoin} disabled={loading}>
            {loading && loadingMsg === 'Recherche du salon...' ? `⏳ ${loadingMsg}` : '🔗 Rejoindre une partie'}
          </button>
        </div>
      </div>
    </div>
  )
}
