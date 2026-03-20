import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set, get } from 'firebase/database'
import { db } from '../firebase'
import { generateQuestions, generateQuestionsTrueFalse, generateQuestionsEstimation } from '../claude'
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
const MODES = [
  { value: 'classique',         icon: '🎯', label: 'Classique',         desc: '4 choix, 10 secondes par question' },
  { value: 'vrai_ou_faux',      icon: '✅', label: 'Vrai ou Faux',      desc: 'Rythme rapide, 2 choix seulement' },
  { value: 'estimation',        icon: '🔢', label: 'Estimation',        desc: 'Devinez le bon chiffre, le plus proche gagne' },
  { value: 'contre_la_montre',  icon: '⚡', label: 'Contre la montre',  desc: 'Max de bonnes réponses en 3 minutes' },
  { value: 'qui_est_le_plus',   icon: '👥', label: 'Qui est le +',      desc: 'Votez pour celui du groupe qui correspond le mieux' },
]

export default function Home() {
  const navigate = useNavigate()
  const [pseudo, setPseudo] = useState('')
  const [theme, setTheme] = useState('')
  const [difficulte, setDifficulte] = useState('moyen')
  const [nombreQuestions, setNombreQuestions] = useState(10)
  const [mode, setMode] = useState('classique')
  const [showMoreModes, setShowMoreModes] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  const selectedModeObj = MODES.find(m => m.value === mode)
  const dropdownModes   = MODES.filter(m => m.value !== mode)

  const handleSelectMode = (value) => {
    setMode(value)
    setShowMoreModes(false)
  }

  const needsTheme = mode !== 'qui_est_le_plus'
  const needsDiff  = mode !== 'qui_est_le_plus'
  const needsNombre = mode !== 'qui_est_le_plus' && mode !== 'contre_la_montre'

  const handleCreate = async () => {
    setError('')
    if (!pseudo.trim()) { setError('Entre ton pseudo !'); return }
    if (needsTheme && !theme.trim()) { setError('Entre un thème !'); return }

    setLoading(true)
    setLoadingMsg('Génération des questions...')

    try {
      let questions = null
      const nb = mode === 'contre_la_montre' ? 20 : nombreQuestions

      if (mode !== 'qui_est_le_plus') {
        if (mode === 'vrai_ou_faux') {
          questions = await generateQuestionsTrueFalse(theme.trim(), difficulte, nb)
        } else if (mode === 'estimation') {
          questions = await generateQuestionsEstimation(theme.trim(), difficulte, nb)
        } else {
          questions = await generateQuestions(theme.trim(), difficulte, nb)
        }
      }

      const code = generateCode()
      setLoadingMsg('Création du salon...')

      await set(ref(db, `salons/${code}`), {
        theme: theme.trim() || '—',
        difficulte: difficulte,
        nombreQuestions: nb,
        mode,
        statut: 'attente',
        questions: questions || null,
        questionActuelle: 0,
        joueurs: { [pseudo.trim()]: { score: 0 } },
      })

      navigate(`/lobby/${code}?pseudo=${encodeURIComponent(pseudo.trim())}`)
    } catch (err) {
      console.error(err)
      setError('Une erreur est survenue. Réessaie.')
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

          {/* Pseudo */}
          <label className="home-label">Ton pseudo</label>
          <input
            className="home-input"
            type="text"
            placeholder="Ex : Alexandre"
            value={pseudo}
            onChange={e => setPseudo(e.target.value)}
            maxLength={20}
          />

          {/* Mode selector */}
          <label className="home-label">Mode de jeu</label>
          <div className="home-modes">

            {/* Carte du mode actif (toujours visible en haut) */}
            <button
              className="home-mode-card home-mode-active"
              onClick={() => setShowMoreModes(v => !v)}
            >
              <span className="home-mode-icon">{selectedModeObj.icon}</span>
              <span className="home-mode-label">{selectedModeObj.label}</span>
              <span className="home-mode-desc">{selectedModeObj.desc}</span>
            </button>

            {/* Bouton toggle */}
            <button
              className={`home-mode-toggle${showMoreModes ? ' home-mode-toggle-open' : ''}`}
              onClick={() => setShowMoreModes(v => !v)}
            >
              <span>
                {mode === 'classique' ? 'Autres modes' : `Mode : ${selectedModeObj.label}`}
              </span>
              <span className="home-mode-toggle-arrow">
                {showMoreModes ? '▲' : '▼'}
              </span>
            </button>

            {/* Dropdown des autres modes */}
            {showMoreModes && (
              <div className="home-mode-dropdown">
                {dropdownModes.map(m => (
                  <button
                    key={m.value}
                    className="home-mode-card"
                    onClick={() => handleSelectMode(m.value)}
                  >
                    <span className="home-mode-icon">{m.icon}</span>
                    <span className="home-mode-label">{m.label}</span>
                    <span className="home-mode-desc">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}

          </div>

          {/* Theme (hidden for qui_est_le_plus) */}
          {needsTheme && (
            <>
              <label className="home-label">Thème de la partie</label>
              <input
                className="home-input"
                type="text"
                placeholder="Ex : cinéma des années 90"
                value={theme}
                onChange={e => setTheme(e.target.value)}
                maxLength={50}
              />
            </>
          )}

          {/* Difficulty (hidden for qui_est_le_plus) */}
          {needsDiff && (
            <>
              <label className="home-label">Difficulté</label>
              <div className="home-difficulty">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.value}
                    className={`home-diff-btn${difficulte === d.value ? ' home-diff-active' : ''}`}
                    onClick={() => setDifficulte(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Number of questions (hidden for qui_est_le_plus and contre_la_montre) */}
          {needsNombre && (
            <>
              <label className="home-label">Nombre de questions</label>
              <div className="home-difficulty">
                {QUESTIONS_OPTIONS.map(n => (
                  <button
                    key={n}
                    className={`home-diff-btn${nombreQuestions === n ? ' home-diff-active' : ''}`}
                    onClick={() => setNombreQuestions(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === 'contre_la_montre' && (
            <p className="home-mode-info">⚡ Toujours 20 questions · 3 minutes de chrono global</p>
          )}
          {mode === 'qui_est_le_plus' && (
            <p className="home-mode-info">👥 Les questions sont générées dans le lobby une fois que tous les joueurs sont connectés</p>
          )}

          {error && <p className="home-error">{error}</p>}

          <button className="home-btn home-btn-primary" onClick={handleCreate}>
            🎮 Créer une partie
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
          />
          {error && <p className="home-error">{error}</p>}
          <button className="home-btn home-btn-secondary" onClick={handleJoin}>
            🔗 Rejoindre une partie
          </button>
        </div>
      </div>
    </div>
  )
}
